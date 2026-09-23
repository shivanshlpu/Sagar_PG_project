import { supabaseAdmin } from '../config/supabase';
import { cache } from '../config/redis';
import { sendWhatsAppMessage, getWhatsAppStatus, decodeBase64Image } from './whatsapp.service';
import { createNotification } from './notifications.service';
import { getReminderSettings } from './settings.service';
import { formatDateDMY, formatMonthMY } from '../utils/date';

/**
 * Check for overdue or due rent records and dispatch daily reminders via WhatsApp and in-app.
 * Strictly enforces:
 *  1. Exactly once per day per tenant (via Redis / in-memory deduplication).
 *  2. Staggered dispatch across tenants (2–5 seconds interval between users).
 *  3. Rate-limited message sending (max 3 messages/second via WhatsApp queue).
 */
/**
 * Helper to get current Indian Standard Time (IST) hour (0 - 23)
 */
function getISTHour(): number {
  const now = new Date();
  const istStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(istStr).getHours();
}

/**
 * Check for overdue or due rent records and dispatch daily reminders via WhatsApp and in-app.
 * Strictly enforces:
 *  1. Active Daytime Window (06:00 AM to 09:00 PM IST) — no night time disturbances.
 *  2. 5 to 10 minutes gap between consecutive tenants across the day.
 *  3. Exactly once per day per tenant (via Redis / in-memory deduplication).
 *  4. Simulated typing presence & random jitter.
 */
export async function checkAndSendRentReminders(targetPgId?: string): Promise<{
  checked: number;
  sent: number;
  skippedAlreadySent: number;
  skippedNoPhone: number;
}> {
  // 1. Daytime Window Check: Only send reminders between 06:00 AM and 09:00 PM (21:00) IST
  const currentISTHour = getISTHour();
  if (currentISTHour < 6 || currentISTHour >= 21) {
    console.log(`[Reminders] Current time (${currentISTHour}:00 IST) is outside active reminder window (06:00 - 21:00). Pausing dispatch until daytime.`);
    return { checked: 0, sent: 0, skippedAlreadySent: 0, skippedNoPhone: 0 };
  }

  const waStatus = getWhatsAppStatus();
  if (waStatus.status !== 'connected') {
    console.log('[Reminders] WhatsApp is not connected. Skipping automated WhatsApp reminders.');
  }

  // Current date strings (in IST / local)
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentDay = now.getDate();

  // 1. Fetch PGs to process
  let pgQuery = supabaseAdmin.from('pgs').select('id, name, upi_id, bank_name, account_number, ifsc_code, account_holder_name, phone');
  if (targetPgId) {
    pgQuery = pgQuery.eq('id', targetPgId);
  }

  const { data: pgs, error: pgError } = await pgQuery;
  if (pgError || !pgs) {
    console.error('[Reminders] Error fetching PGs:', pgError?.message);
    return { checked: 0, sent: 0, skippedAlreadySent: 0, skippedNoPhone: 0 };
  }

  let totalChecked = 0;
  let totalSent = 0;
  let totalSkippedAlreadySent = 0;
  let totalSkippedNoPhone = 0;

  for (const pg of pgs) {
    // 2. Fetch reminder settings & payment QR for this PG
    const reminderSettings = await getReminderSettings(pg.id);
    const rentReminderDay = reminderSettings.rent_reminder_day || 1;

    const { data: qrData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', `payment_qr_${pg.id}`)
      .maybeSingle();

    const paymentQrStr = qrData?.value ? (typeof qrData.value === 'string' ? qrData.value : (qrData.value.qr || qrData.value.url || null)) : null;
    const qrBuffer = paymentQrStr ? decodeBase64Image(paymentQrStr) : null;

    // 3. Find pending or overdue rent records
    const { data: rentRecords, error: rentError } = await supabaseAdmin
      .from('rent_records')
      .select('*, tenant:tenants(id, user_id, full_name, phone, status), room:rooms(room_number)')
      .eq('pg_id', pg.id)
      .in('status', ['pending', 'overdue'])
      .order('due_date', { ascending: true });

    if (rentError || !rentRecords) {
      console.warn(`[Reminders] Could not fetch rent records for PG ${pg.id}:`, rentError?.message);
      continue;
    }

    // Filter for records that have reached or passed their due date
    const eligibleRecords = rentRecords.filter((record) => {
      const tenant = record.tenant as any;
      if (!tenant || tenant.status !== 'active') return false;

      const recordDueDate = record.due_date ? record.due_date.split('T')[0] : '';
      const isDue = recordDueDate ? recordDueDate <= todayStr : currentDay >= rentReminderDay;
      return isDue;
    });

    totalChecked += eligibleRecords.length;

    // 4. Staggered dispatch across tenants throughout the day (5 to 10 minutes between tenants)
    let staggerIndex = 0;
    let accumulatedStaggerMs = 0;

    for (const record of eligibleRecords) {
      const tenant = record.tenant as any;
      const room = record.room as any;
      const tenantPhone = tenant.phone?.replace(/\D/g, '') || '';

      if (!tenantPhone || tenantPhone.length < 10) {
        totalSkippedNoPhone++;
        continue;
      }

      // Deduplication key: strictly once per day per tenant (DD-MM-YYYY format)
      const todayDMY = formatDateDMY(now);
      const dedupKey = `reminder:rent:${tenant.id}:${todayDMY}`;
      const isFirstToday = await cache.setIfNotExists(dedupKey, 'scheduled', 86400); // 24 hours

      if (!isFirstToday) {
        totalSkippedAlreadySent++;
        continue;
      }

      // Anti-Spam Distribution: Spread reminders across the day with a 5 to 10 minute gap between tenants
      // First tenant sends in 30 seconds; subsequent tenants are spaced by 5-10 minutes each
      let staggerDelayMs = 0;
      if (staggerIndex > 0) {
        // Base 5 minutes (300,000 ms) + random jitter between 0 and 5 minutes (up to 300,000 ms)
        // Gives ~5 to 10 minutes between consecutive tenants
        const randomGapMs = 300_000 + Math.floor(Math.random() * 300_000);
        staggerDelayMs = accumulatedStaggerMs + randomGapMs;
        accumulatedStaggerMs = staggerDelayMs;
      } else {
        staggerDelayMs = 30_000; // First tenant starts in 30 seconds
        accumulatedStaggerMs = 30_000;
      }
      staggerIndex++;

      // Check if scheduled time exceeds 21:00 (9:00 PM IST) tonight
      const scheduledDate = new Date(Date.now() + staggerDelayMs);
      const scheduledISTHour = new Date(scheduledDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
      if (scheduledISTHour >= 21 || scheduledISTHour < 6) {
        console.log(`[Reminders] Tenant ${tenant.full_name} would be sent outside daytime hours (~${scheduledISTHour}:00 IST). Postponing.`);
        await cache.del(dedupKey);
        continue;
      }

      const scheduledTimeStr = scheduledDate.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      });
      console.log(`[Reminders] Staggered reminder for ${tenant.full_name}: queued for dispatch at ~${scheduledTimeStr} IST (in ${Math.round(staggerDelayMs / 60000)} mins)`);

      const formattedAmount = (record.total_due_paise / 100).toLocaleString('en-IN');
      const dueDateFormatted = formatDateDMY(record.due_date);
      const monthFormatted = formatMonthMY(record.month);

      let paymentDetails = '';
      if (pg.upi_id) {
        paymentDetails += `• UPI ID: *${pg.upi_id}*\n`;
      }
      if (pg.account_number) {
        paymentDetails += `• Bank: *${pg.bank_name || 'Bank'}*\n`;
        paymentDetails += `• Account No: *${pg.account_number}*\n`;
        paymentDetails += `• IFSC: *${pg.ifsc_code || 'N/A'}*\n`;
        if (pg.account_holder_name) {
          paymentDetails += `• Name: *${pg.account_holder_name}*\n`;
        }
      }
      if (qrBuffer) {
        paymentDetails += `📸 *Payment QR code is attached above. Scan & pay via any UPI app.*\n`;
      }

      const reminderMessage =
        `🔔 *${pg.name} — Rent Payment Reminder*\n\n` +
        `Dear *${tenant.full_name}*,\n\n` +
        `This is a friendly reminder that your rent for *${monthFormatted}* is due.\n\n` +
        `👤 *Tenant*: *${tenant.full_name}*\n` +
        `🏠 *Room*: ${room?.room_number || 'Assigned Room'}\n` +
        `💰 *Amount Due*: ₹${formattedAmount}\n` +
        `📅 *Due Date*: ${dueDateFormatted}\n\n` +
        (paymentDetails ? `*Payment Details*:\n${paymentDetails}\n` : '') +
        `After paying, enter your UTR / Reference ID in the resident portal so we can verify and mark it as paid.\n` +
        `_If you have already paid, kindly ignore this message._`;

      // Schedule staggered dispatch
      setTimeout(async () => {
        try {
          if (waStatus.status === 'connected') {
            await sendWhatsAppMessage(tenantPhone, reminderMessage, { imageBuffer: qrBuffer });
            console.log(`[Reminders] WhatsApp reminder sent to ${tenant.full_name} (${tenantPhone}) for ${monthFormatted} (hasQR: ${Boolean(qrBuffer)})`);
          }

          // Mark as sent in deduplication cache
          await cache.setWithExpiry(dedupKey, 'sent', 86400);

          // In-app notification for the tenant
          if (tenant.user_id) {
            await createNotification({
              userId: tenant.user_id,
              title: 'Rent Payment Due',
              message: `Your rent of ₹${formattedAmount} for ${monthFormatted} is pending. Please complete the payment.`,
              type: 'rent_reminder',
              metadata: { rentRecordId: record.id, month: record.month, totalDuePaise: record.total_due_paise },
            }).catch(() => {});
          }
        } catch (err: any) {
          console.error(`[Reminders] Failed to send reminder to ${tenant.full_name}:`, err.message);
        }
      }, staggerDelayMs);

      totalSent++;
    }
  }

  return {
    checked: totalChecked,
    sent: totalSent,
    skippedAlreadySent: totalSkippedAlreadySent,
    skippedNoPhone: totalSkippedNoPhone,
  };
}

let cronInterval: NodeJS.Timeout | null = null;

/**
 * Starts the automated daily reminder scheduler.
 * Runs once every hour, safely deduplicating so each tenant receives at most 1 reminder per day.
 */
export function startReminderCron(): void {
  if (cronInterval) return;

  console.log('[Reminders] Starting automated rent reminder scheduler (hourly check, strictly once-per-day per tenant)...');

  // Initial check after 30 seconds (gives DB & WhatsApp time to connect)
  setTimeout(() => {
    checkAndSendRentReminders().catch((err) => {
      console.error('[Reminders] Initial check error:', err.message);
    });
  }, 30_000);

  // Hourly check
  cronInterval = setInterval(() => {
    console.log('[Reminders] Running scheduled rent reminder check...');
    checkAndSendRentReminders().catch((err) => {
      console.error('[Reminders] Scheduled check error:', err.message);
    });
  }, 3600_000); // every 1 hour
}

export function stopReminderCron(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}
