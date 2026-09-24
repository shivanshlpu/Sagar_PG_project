import { supabaseAdmin } from '../config/supabase';
import { cache } from '../config/redis';
import { sendWhatsAppMessage, decodeBase64Image, getWhatsAppStatus } from './whatsapp.service';
import { createNotification } from './notifications.service';
import { getWhatsAppMessageTemplates, renderWhatsAppTemplate } from './settings.service';
import { ensureDueRentRecords } from './rent.service';
import { formatDateDMY, formatMonthMY } from '../utils/date';

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
 *  2. Individual due date arrival check — reminders only sent when tenant's cycle due date actually arrives.
 *  3. Strictly once every 24 hours per tenant with persistent DB counter & timestamp.
 *  4. Instant termination if payment is verified and marked as 'paid'.
 *  5. Staggered dispatch across tenants throughout the day (5 to 10 minutes gap).
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

  // Current date strings (in IST / local)
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMonthStr = todayStr.slice(0, 7);

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
    // 2. Check if WhatsApp session for this PG is connected before processing
    const waStatus = getWhatsAppStatus(pg.id);
    if (waStatus.status !== 'connected') {
      console.log(`[Reminders] Skipping rent reminder dispatch for PG [${pg.name} (${pg.id})] — WhatsApp is not connected.`);
      continue;
    }

    // Auto-generate rent records for tenants whose individual due dates have arrived today
    await ensureDueRentRecords(pg.id, currentMonthStr);

    const { data: qrData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', `payment_qr_${pg.id}`)
      .maybeSingle();

    const paymentQrStr = qrData?.value ? (typeof qrData.value === 'string' ? qrData.value : (qrData.value.qr || qrData.value.url || null)) : null;
    const qrBuffer = paymentQrStr ? decodeBase64Image(paymentQrStr) : null;

    // 3. Find pending or overdue rent records that are unpaid
    const { data: rentRecords, error: rentError } = await supabaseAdmin
      .from('rent_records')
      .select('*, tenant:tenants(id, user_id, full_name, phone, status, move_in_date), room:rooms(room_number)')
      .eq('pg_id', pg.id)
      .in('status', ['pending', 'overdue'])
      .is('paid_date', null)
      .order('due_date', { ascending: true });

    if (rentError || !rentRecords) {
      console.warn(`[Reminders] Could not fetch rent records for PG ${pg.id}:`, rentError?.message);
      continue;
    }

    // Filter for records that have reached or passed their due date and haven't had a reminder in 24 hours
    const eligibleRecords: any[] = [];

    for (const record of rentRecords) {
      const tenant = record.tenant as any;
      if (!tenant || tenant.status !== 'active') continue;

      // STOP IMMEDIATELY if marked paid or paid_date exists
      if (record.status === 'paid' || record.paid_date) continue;

      // Pause automated reminder spam if tenant has submitted a payment awaiting admin verification
      const { data: pendingPayment } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('pg_id', pg.id)
        .eq('tenant_id', tenant.id)
        .eq('status', 'submitted')
        .maybeSingle();

      if (pendingPayment) {
        console.log(`[Reminders] Tenant ${tenant.full_name} has a payment awaiting verification. Pausing automated reminder.`);
        continue;
      }

      // Ensure tenant's due date has actually arrived
      const recordDueDate = record.due_date ? record.due_date.split('T')[0] : '';
      if (!recordDueDate || recordDueDate > todayStr) {
        // Due date has not arrived yet! Skip!
        continue;
      }

      // Check persistent 24-HOUR rate limit from record.notes
      let parsedNotes: any = {};
      if (record.notes) {
        try { parsedNotes = JSON.parse(record.notes); } catch {}
      }

      const lastSentAt = parsedNotes.last_reminder_sent_at;
      if (lastSentAt) {
        const lastSentTime = new Date(lastSentAt).getTime();
        if (!isNaN(lastSentTime)) {
          const elapsedHours = (Date.now() - lastSentTime) / (1000 * 60 * 60);
          if (elapsedHours < 24) {
            console.log(`[Reminders] Skipping ${tenant.full_name}: reminder #${parsedNotes.reminder_count || 1} already sent ${elapsedHours.toFixed(1)}h ago (< 24h).`);
            totalSkippedAlreadySent++;
            continue;
          }
        }
      }

      // Secondary check in Redis / cache
      const todayDMY = formatDateDMY(now);
      const dedupKey = `reminder:rent:${pg.id}:${tenant.id}:${todayDMY}`;
      const isFirstToday = await cache.setIfNotExists(dedupKey, 'scheduled', 86400); // 24 hours
      if (!isFirstToday) {
        totalSkippedAlreadySent++;
        continue;
      }

      eligibleRecords.push(record);
    }

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

      const dedupKey = `reminder:rent:${pg.id}:${tenant.id}:${formatDateDMY(now)}`;

      // Anti-Spam Distribution: Spread reminders across the day with a 5 to 10 minute gap between tenants
      let staggerDelayMs = 0;
      if (staggerIndex > 0) {
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

      let parsedNotes: any = {};
      if (record.notes) {
        try { parsedNotes = JSON.parse(record.notes); } catch {}
      }

      const electricityUnits = parsedNotes.electricity_units || 0;

      const templates = await getWhatsAppMessageTemplates(pg.id);
      const templateVars: Record<string, string | number> = {
        tenant_name: tenant.full_name || 'Resident',
        room_number: room?.room_number || 'N/A',
        month: monthFormatted,
        amount: formattedAmount,
        due_date: dueDateFormatted,
        units: electricityUnits,
        pg_name: pg.name || 'Sagar PG',
        upi_id: pg.upi_id || '',
      };

      const reminderMessage = renderWhatsAppTemplate(templates.rent_reminder_message, templateVars);

      // Schedule staggered dispatch strictly bound to pg.id
      setTimeout(async () => {
        try {
          // 1. FRESH DB CHECK right before dispatch
          const { data: freshRecord, error: freshErr } = await supabaseAdmin
            .from('rent_records')
            .select('id, status, paid_date, notes')
            .eq('id', record.id)
            .single();

          if (freshErr || !freshRecord) {
            console.log(`[Reminders] Rent record ${record.id} not found on fresh check. Skipping.`);
            return;
          }

          if (freshRecord.status === 'paid' || freshRecord.paid_date) {
            console.log(`[Reminders] Rent record ${record.id} for ${tenant.full_name} is marked as PAID. Reminders stopped.`);
            return;
          }

          let freshNotes: any = {};
          try { freshNotes = JSON.parse(freshRecord.notes || '{}'); } catch {}

          if (freshNotes.last_reminder_sent_at) {
            const hoursSince = (Date.now() - new Date(freshNotes.last_reminder_sent_at).getTime()) / (1000 * 60 * 60);
            if (hoursSince < 24) {
              console.log(`[Reminders] Fresh check: reminder for ${tenant.full_name} was already sent ${hoursSince.toFixed(1)}h ago. Aborting dispatch.`);
              return;
            }
          }

          // 2. Dispatch WhatsApp message
          await sendWhatsAppMessage(tenantPhone, reminderMessage, {
            pgId: pg.id,
            purpose: 'RENT_REMINDER',
            imageBuffer: qrBuffer,
          });

          // 3. Increment counter and persist last_reminder_sent_at in DB
          const currentCount = typeof freshNotes.reminder_count === 'number' ? freshNotes.reminder_count : 0;
          const newCount = currentCount + 1;
          const nowIso = new Date().toISOString();

          const updatedNotes = {
            ...freshNotes,
            reminder_count: newCount,
            last_reminder_sent_at: nowIso,
          };

          await supabaseAdmin
            .from('rent_records')
            .update({
              notes: JSON.stringify(updatedNotes),
              updated_at: nowIso,
            })
            .eq('id', record.id);

          // Also persist in settings table as secondary index
          await supabaseAdmin.from('settings').upsert({
            pg_id: pg.id,
            key: `reminder_sent_${pg.id}_${record.id}`,
            value: { count: newCount, last_sent_at: nowIso, tenant_id: tenant.id },
            updated_at: nowIso,
          });

          await cache.setWithExpiry(dedupKey, 'sent', 86400);

          console.log(`[Reminders] WhatsApp reminder #${newCount} sent to ${tenant.full_name} (${tenantPhone}) for ${monthFormatted}`);

          // 4. In-app notification for the tenant
          if (tenant.user_id) {
            await createNotification({
              userId: tenant.user_id,
              title: 'Rent Payment Due',
              message: `Your rent of ₹${formattedAmount} for ${monthFormatted} is pending. Please complete the payment.`,
              type: 'rent_reminder',
              metadata: { rentRecordId: record.id, month: record.month, totalDuePaise: record.total_due_paise, pgId: pg.id, reminderCount: newCount },
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
 * Runs once every hour, strictly checking persistent DB timestamps and enforcing 24h intervals.
 */
export function startReminderCron(): void {
  if (cronInterval) return;

  console.log('[Reminders] Starting automated rent reminder scheduler (hourly check, strictly 24h per tenant, persistent counter)...');

  // Initial check after 2 minutes (gives DB & WhatsApp time to stabilize, avoiding bursts on rapid server reloads)
  setTimeout(() => {
    checkAndSendRentReminders().catch((err) => {
      console.error('[Reminders] Initial check error:', err.message);
    });
  }, 120_000);

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
