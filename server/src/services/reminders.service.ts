import { supabaseAdmin } from '../config/supabase';
import { cache } from '../config/redis';
import { sendWhatsAppMessage, getWhatsAppStatus } from './whatsapp.service';
import { createNotification } from './notifications.service';
import { getReminderSettings } from './settings.service';
import { formatDateDMY } from '../utils/date';

/**
 * Check for overdue or due rent records and dispatch daily reminders via WhatsApp and in-app.
 * Strictly enforces:
 *  1. Exactly once per day per tenant (via Redis / in-memory deduplication).
 *  2. Staggered dispatch across tenants (2–5 seconds interval between users).
 *  3. Rate-limited message sending (max 3 messages/second via WhatsApp queue).
 */
export async function checkAndSendRentReminders(targetPgId?: string): Promise<{
  checked: number;
  sent: number;
  skippedAlreadySent: number;
  skippedNoPhone: number;
}> {
  const waStatus = getWhatsAppStatus();
  if (waStatus.status !== 'connected') {
    console.log('[Reminders] WhatsApp is not connected. Skipping automated WhatsApp reminders.');
  }

  // Current date strings (in IST / local)
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentDay = now.getDate();

  // 1. Fetch PGs to process
  let pgQuery = supabaseAdmin.from('pgs').select('id, name, upi_id, bank_name, account_number, ifsc_code, phone');
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
    // 2. Fetch reminder settings for this PG
    const reminderSettings = await getReminderSettings(pg.id);
    const rentReminderDay = reminderSettings.rent_reminder_day || 1;

    // 3. Find pending or overdue rent records
    // A record is eligible if status is 'pending' or 'overdue' and due_date <= today
    // OR if today >= rentReminderDay for the current month
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

      // Check if due_date is reached or today >= rentReminderDay
      const recordDueDate = record.due_date ? record.due_date.split('T')[0] : '';
      const isDue = recordDueDate ? recordDueDate <= todayStr : currentDay >= rentReminderDay;
      return isDue;
    });

    totalChecked += eligibleRecords.length;

    // 4. Staggered dispatch across tenants
    let staggerIndex = 0;

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
      const isFirstToday = await cache.setIfNotExists(dedupKey, 'sent', 86400); // 24 hours

      if (!isFirstToday) {
        totalSkippedAlreadySent++;
        continue;
      }

      // Stagger interval: 2 seconds per tenant to ensure users receive messages at different times
      const staggerDelayMs = staggerIndex * 2000;
      staggerIndex++;

      const formattedAmount = (record.total_due_paise / 100).toLocaleString('en-IN');
      const dueDateFormatted = formatDateDMY(record.due_date);

      const reminderMessage =
        `🔔 *${pg.name} — Rent Payment Reminder*\n\n` +
        `Dear *${tenant.full_name}*,\n\n` +
        `This is a friendly reminder that your rent for *${record.month}* is due.\n\n` +
        `💰 *Amount Due*: ₹${formattedAmount}\n` +
        `📅 *Due Date*: ${dueDateFormatted}\n` +
        `🏠 *Room*: ${room?.room_number || 'Assigned Room'}\n\n` +
        `*Payment Options*:\n` +
        (pg.upi_id ? `• UPI ID: *${pg.upi_id}*\n` : '') +
        (pg.account_number ? `• Account: *${pg.account_number}* (${pg.bank_name || 'Bank'})\n• IFSC: *${pg.ifsc_code || 'N/A'}*\n` : '') +
        `\nPlease complete the payment and share the screenshot in the portal.\n_If you have already paid, kindly ignore this message._`;

      // Schedule staggered dispatch
      setTimeout(async () => {
        try {
          if (waStatus.status === 'connected') {
            await sendWhatsAppMessage(tenantPhone, reminderMessage);
            console.log(`[Reminders] WhatsApp reminder sent to ${tenant.full_name} (${tenantPhone}) for ${record.month}`);
          }

          // In-app notification for the tenant
          if (tenant.user_id) {
            await createNotification({
              userId: tenant.user_id,
              title: 'Rent Payment Due',
              message: `Your rent of ₹${formattedAmount} for ${record.month} is pending. Please pay to avoid late fees.`,
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
