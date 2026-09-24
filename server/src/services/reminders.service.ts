import { supabaseAdmin } from '../config/supabase';
import { cache } from '../config/redis';
import { sendWhatsAppMessage, decodeBase64Image, getWhatsAppStatus } from './whatsapp.service';
import { createNotification } from './notifications.service';
import { ensureDueRentRecords } from './rent.service';
import { formatDateDMY, formatMonthMY } from '../utils/date';
import QRCode from 'qrcode';

/**
 * Helper to get current Indian Standard Time (IST) hour (0 - 23)
 */
function getISTHour(): number {
  const now = new Date();
  const istStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(istStr).getHours();
}

/**
 * Checks if a given ISO timestamp occurred on today's calendar date in Indian Standard Time (IST).
 * Strictly guarantees that at most 1 reminder message is dispatched per day per tenant.
 */
export function isSentToday(isoDateString?: string | null): boolean {
  if (!isoDateString) return false;
  const sentDate = new Date(isoDateString);
  if (isNaN(sentDate.getTime())) return false;
  const sentIST = sentDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const nowIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  return sentIST === nowIST;
}

/**
 * Human-friendly format for last reminder sent time in IST (e.g., "Today, 10:30 AM", "Yesterday, 04:15 PM")
 */
export function formatReminderTimeIST(isoDateString?: string | null): string | null {
  if (!isoDateString) return null;
  const d = new Date(isoDateString);
  if (isNaN(d.getTime())) return null;

  const nowIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const dIST = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const timeStr = d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (dIST === nowIST) {
    return `Today, ${timeStr}`;
  }

  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (dIST === yesterday) {
    return `Yesterday, ${timeStr}`;
  }

  return `${formatDateDMY(isoDateString)}, ${timeStr}`;
}

export interface RentReminderPayload {
  tenantName: string;
  roomNumber: string;
  month: string;
  monthFormatted: string;
  dueDateFormatted: string;
  isOverdue: boolean;
  daysOverdue: number;
  baseRentPaise: number;
  maintenancePaise: number;
  electricityUnits: number;
  electricityRatePaise?: number;
  electricityAmountPaise: number;
  totalDuePaise: number;
  isElectricityFinalized: boolean;
  pgName: string;
  upiId?: string | null;
}

/**
 * Builds the customized reminder message based on the two distinct billing lifecycle scenarios:
 *
 * SCENARIO A (Electricity figures NOT yet finalized):
 * - Informs tenant rent is due (or overdue).
 * - Explicitly tells tenant that electricity usage and meter reading will be visible in the app once figures are updated.
 * - Continues to go out once daily until the admin uploads/finalizes the electricity figures.
 *
 * SCENARIO B (Electricity figures ARE finalized):
 * - Combined total (Room Rent + Electricity + Maintenance).
 * - Includes payment QR code alongside the message.
 * - Instructs tenant to pay and submit their 12-digit UTR in the app for verification.
 *
 * OVERDUE:
 * - Prominently notifies that rent is overdue and asks for immediate clearance.
 */
export function buildRentReminderMessage(payload: RentReminderPayload): { text: string; needsQr: boolean } {
  const {
    tenantName,
    roomNumber,
    monthFormatted,
    dueDateFormatted,
    isOverdue,
    daysOverdue,
    baseRentPaise,
    maintenancePaise,
    electricityUnits,
    electricityAmountPaise,
    totalDuePaise,
    isElectricityFinalized,
    pgName,
    upiId,
  } = payload;

  const rentFormatted = (baseRentPaise / 100).toLocaleString('en-IN');
  const maintFormatted = (maintenancePaise / 100).toLocaleString('en-IN');
  const elecFormatted = (electricityAmountPaise / 100).toLocaleString('en-IN');
  const totalFormatted = (totalDuePaise / 100).toLocaleString('en-IN');

  // Scenario A: Electricity bill not yet finalized for this tenant
  if (!isElectricityFinalized) {
    if (isOverdue) {
      return {
        text: `⚠️ *Rent Overdue Notification — ${pgName}*

Dear *${tenantName}* (${roomNumber}),
Your rent for *${monthFormatted}* is currently *${daysOverdue} days overdue* (was due on *${dueDateFormatted}*).

📋 *Current Details:*
• Room Rent: *₹${rentFormatted}*
• Maintenance: *₹${maintFormatted}*
• Electricity Charges: *Pending final reading*

ℹ️ *Electricity Usage Note:*
Electricity usage and charges are currently being recorded and will be visible in the Sagar PG app shortly. Once figures are updated, you will receive the final combined total with your payment QR code.

Please clear your pending room rent dues promptly.

— Team *${pgName}*`,
        needsQr: false,
      };
    }

    return {
      text: `🔔 *Rent Due Notification — ${pgName}*

Dear *${tenantName}* (${roomNumber}),
This is a reminder that your rent for *${monthFormatted}* is due on *${dueDateFormatted}*.

📋 *Current Details:*
• Room Rent: *₹${rentFormatted}*
• Maintenance: *₹${maintFormatted}*
• Electricity Charges: *Pending final reading*

ℹ️ *Electricity Usage Note:*
Your electricity usage and meter reading will be visible in the Sagar PG app shortly once figures are updated. Once finalized, you will receive an updated bill with the combined total and payment QR code.

— Team *${pgName}*`,
      needsQr: false,
    };
  }

  // Scenario B: Electricity bill is finalized — combined total with QR code & UTR verification prompt
  if (isOverdue) {
    return {
      text: `⚠️ *Payment Overdue Notice — ${pgName}*

Dear *${tenantName}* (${roomNumber}),
Your bill for *${monthFormatted}* is *${daysOverdue} days overdue* (was due on *${dueDateFormatted}*).

📋 *Combined Dues Breakdown:*
• Room Rent: *₹${rentFormatted}*
• Electricity (${electricityUnits} units): *₹${elecFormatted}*
• Maintenance: *₹${maintFormatted}*
--------------------------------
💰 *Total Outstanding Due: ₹${totalFormatted}*

📲 *How to Pay & Verify in App:*
1. Scan the attached payment QR code or pay via UPI: *${upiId || 'Check app'}*
2. After making the payment, open the Sagar PG app
3. Go to *Pay Rent / Submit UTR*, enter your 12-digit UTR number, and submit
4. Upon verification, your official verified bill and confirmation receipt will be sent to you here on WhatsApp.

Please clear your overdue payment today to avoid interruption in PG amenities.

— Team *${pgName}*`,
      needsQr: true,
    };
  }

  return {
    text: `🔔 *Rent & Electricity Bill — ${pgName}*

Dear *${tenantName}* (${roomNumber}),
Your bill for *${monthFormatted}* is ready (Due Date: *${dueDateFormatted}*).

📋 *Itemized Dues Breakdown:*
• Room Rent: *₹${rentFormatted}*
• Electricity (${electricityUnits} units): *₹${elecFormatted}*
• Maintenance: *₹${maintFormatted}*
--------------------------------
💰 *Total Amount Due: ₹${totalFormatted}*

📲 *How to Pay & Verify in App:*
1. Scan the attached payment QR code or pay via UPI: *${upiId || 'Check app'}*
2. After making the payment, open the Sagar PG app
3. Go to *Pay Rent / Submit UTR*, enter your 12-digit UTR number, and submit
4. Your payment will be verified, and you will receive your official bill and payment confirmation.

— Team *${pgName}*`,
    needsQr: true,
  };
}

/**
 * Retrieves the PG's payment QR code buffer.
 * Uses custom uploaded QR image from settings if available, or generates dynamic high-res UPI QR code.
 */
export async function getPaymentQrBuffer(
  pgId: string,
  upiId: string | null | undefined,
  pgName: string,
  amountPaise: number,
  month: string
): Promise<Buffer | null> {
  try {
    const { data: qrData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', `payment_qr_${pgId}`)
      .maybeSingle();

    let paymentQrStr: string | null = null;
    if (qrData?.value) {
      paymentQrStr = typeof qrData.value === 'string' ? qrData.value : (qrData.value.qr || qrData.value.url || null);
    }

    if (paymentQrStr) {
      const customBuffer = decodeBase64Image(paymentQrStr);
      if (customBuffer) return customBuffer;
    }

    if (upiId && upiId.trim()) {
      const amountRupees = (amountPaise / 100).toFixed(2);
      const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodeURIComponent(pgName)}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent(`Rent ${month}`)}`;
      return await QRCode.toBuffer(upiUrl, {
        width: 320,
        margin: 2,
        color: { dark: '#0f2942', light: '#ffffff' },
      });
    }
  } catch (err: any) {
    console.warn('[Reminders] Notice retrieving payment QR buffer:', err?.message);
  }

  return null;
}

/**
 * Dispatches a reminder to a single tenant with strict 1-message-per-day enforcement.
 */
export async function sendSingleRentReminder(
  pgId: string,
  tenantId: string,
  targetMonth?: string,
  force: boolean = false
): Promise<{
  success: boolean;
  message: string;
  reminder_count?: number;
  last_reminder_sent_at?: string;
  already_sent_today?: boolean;
}> {
  const now = new Date();
  const month = targetMonth || now.toISOString().slice(0, 7);
  const todayStr = now.toISOString().slice(0, 10);

  // 1. Fetch tenant details
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, user_id, full_name, phone, move_in_date, status, room:rooms(room_number, base_rent_paise)')
    .eq('id', tenantId)
    .eq('pg_id', pgId)
    .single();

  if (tenantErr || !tenant) {
    throw new Error('Tenant not found');
  }

  if (!tenant.phone) {
    throw new Error('Tenant has no registered phone number for WhatsApp reminders');
  }

  // 2. Fetch PG profile
  const { data: pg } = await supabaseAdmin
    .from('pgs')
    .select('id, name, upi_id')
    .eq('id', pgId)
    .single();

  const pgName = pg?.name || 'Sagar PG';

  // 3. Find or ensure rent record exists
  let { data: record } = await supabaseAdmin
    .from('rent_records')
    .select('*')
    .eq('pg_id', pgId)
    .eq('tenant_id', tenantId)
    .eq('month', month)
    .maybeSingle();

  if (!record) {
    await ensureDueRentRecords(pgId, month);
    // Find newly created record
    const { data: refetched } = await supabaseAdmin
      .from('rent_records')
      .select('*')
      .eq('pg_id', pgId)
      .eq('tenant_id', tenantId)
      .eq('month', month)
      .maybeSingle();
    record = refetched;
  }

  if (!record) {
    throw new Error('Could not initialize rent record for tenant');
  }

  // 4. Do not send reminder if record is already paid
  if (record.status === 'paid' || record.paid_date) {
    return {
      success: false,
      message: 'Rent is already marked as PAID for this resident. Reminders are permanently stopped.',
    };
  }

  // 5. Do not send reminder if tenant has submitted payment awaiting admin verification
  const { data: pendingPayment } = await supabaseAdmin
    .from('payments')
    .select('id, utr_id')
    .eq('pg_id', pgId)
    .eq('tenant_id', tenantId)
    .eq('status', 'submitted')
    .maybeSingle();

  if (pendingPayment) {
    return {
      success: false,
      message: 'Resident has submitted payment with UTR awaiting your verification in Rent Tracker. Please verify payment.',
    };
  }

  // 6. Strict Daily Idempotence: Check if reminder was already sent today
  let parsedNotes: any = {};
  if (record.notes) {
    try { parsedNotes = JSON.parse(record.notes); } catch {}
  }

  const lastSentAt = parsedNotes.last_reminder_sent_at;
  if (!force && isSentToday(lastSentAt)) {
    const formattedTime = formatReminderTimeIST(lastSentAt);
    return {
      success: false,
      already_sent_today: true,
      message: `Today's daily reminder was already sent (${formattedTime}). The system strictly enforces 1 message per day to prevent tenant spam.`,
      reminder_count: parsedNotes.reminder_count || 1,
      last_reminder_sent_at: lastSentAt,
    };
  }

  // 7. Check electricity bill status
  const { data: elBill } = await supabaseAdmin
    .from('electricity_bills')
    .select('*')
    .eq('pg_id', pgId)
    .eq('tenant_id', tenantId)
    .eq('month', month)
    .maybeSingle();

  const isElectricityFinalized = Boolean(
    elBill && (
      elBill.units_consumed > 0 ||
      elBill.current_reading > 0 ||
      elBill.total_amount_paise > 0 ||
      elBill.status === 'pending' ||
      elBill.status === 'paid'
    )
  );

  // 8. Compute itemized amounts
  const tenantRoom = tenant.room as any;
  const baseRentPaise = record.rent_amount_paise || tenantRoom?.base_rent_paise || 0;
  const maintenancePaise = parsedNotes.maintenance_paise ?? 50000;
  const electricityUnits = elBill ? (elBill.units_consumed || 0) : (parsedNotes.electricity_units || 0);
  const electricityRatePaise = elBill ? (elBill.rate_per_unit_paise || 1200) : (parsedNotes.electricity_rate_per_unit_paise || 1200);
  const electricityAmountPaise = elBill ? (elBill.total_amount_paise || (electricityUnits * electricityRatePaise)) : (parsedNotes.electricity_amount_paise || 0);
  const lateFeePaise = record.late_fee_paise || 0;
  const totalDuePaise = baseRentPaise + maintenancePaise + electricityAmountPaise + lateFeePaise;

  const recordDueDate = record.due_date ? record.due_date.slice(0, 10) : todayStr;
  const isOverdue = recordDueDate < todayStr;
  const daysOverdue = isOverdue
    ? Math.max(1, Math.round((new Date(todayStr).getTime() - new Date(recordDueDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const roomNumber = tenantRoom?.room_number ? `Room ${tenantRoom.room_number}` : 'Room';
  const monthFormatted = formatMonthMY(month);
  const dueDateFormatted = formatDateDMY(record.due_date || todayStr);

  // 9. Build appropriate scenario message
  const reminderContent = buildRentReminderMessage({
    tenantName: tenant.full_name || 'Resident',
    roomNumber,
    month,
    monthFormatted,
    dueDateFormatted,
    isOverdue,
    daysOverdue,
    baseRentPaise,
    maintenancePaise,
    electricityUnits,
    electricityRatePaise,
    electricityAmountPaise,
    totalDuePaise,
    isElectricityFinalized,
    pgName,
    upiId: pg?.upi_id,
  });

  // 10. Fetch QR buffer if Scenario B
  let qrBuffer: Buffer | null = null;
  if (reminderContent.needsQr) {
    qrBuffer = await getPaymentQrBuffer(pgId, pg?.upi_id, pgName, totalDuePaise, monthFormatted);
  }

  // 11. Dispatch WhatsApp message
  await sendWhatsAppMessage(tenant.phone, reminderContent.text, {
    pgId,
    purpose: isOverdue ? 'OVERDUE_REMINDER' : 'RENT_REMINDER',
    imageBuffer: qrBuffer,
  });

  // 12. Update rent record notes with new count and timestamp
  const currentCount = typeof parsedNotes.reminder_count === 'number' ? parsedNotes.reminder_count : 0;
  const newCount = currentCount + 1;
  const nowIso = new Date().toISOString();

  const updatedNotes = {
    ...parsedNotes,
    base_rent_paise: baseRentPaise,
    maintenance_paise: maintenancePaise,
    electricity_units: electricityUnits,
    electricity_rate_per_unit_paise: electricityRatePaise,
    electricity_amount_paise: electricityAmountPaise,
    total_due_paise: totalDuePaise,
    reminder_count: newCount,
    last_reminder_sent_at: nowIso,
  };

  await supabaseAdmin
    .from('rent_records')
    .update({
      total_due_paise: totalDuePaise,
      notes: JSON.stringify(updatedNotes),
      updated_at: nowIso,
    })
    .eq('id', record.id);

  // In-app notification
  if (tenant.user_id) {
    await createNotification({
      userId: tenant.user_id,
      title: isOverdue ? 'Rent Payment Overdue' : 'Rent Payment Due',
      message: `Your rent for ${monthFormatted} (₹${(totalDuePaise / 100).toLocaleString('en-IN')}) is pending. Please complete payment and submit your UTR in the app.`,
      type: 'rent_reminder',
      metadata: { rentRecordId: record.id, month, totalDuePaise, reminderCount: newCount },
    }).catch(() => {});
  }

  return {
    success: true,
    message: `WhatsApp reminder dispatched to ${tenant.full_name} (${isElectricityFinalized ? 'Finalized Bill with QR' : 'Initial Reminder, Electricity in App'})!`,
    reminder_count: newCount,
    last_reminder_sent_at: nowIso,
  };
}

/**
 * Check for overdue or due rent records and dispatch daily reminders via WhatsApp and in-app.
 * Strictly enforces:
 *  1. Active Daytime Window (06:00 AM to 09:00 PM IST) — no night time disturbances.
 *  2. Individual due date arrival check — reminders only sent when tenant's cycle due date actually arrives.
 *  3. Strictly once every calendar day per tenant (idempotent, no duplicate spam).
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

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMonthStr = todayStr.slice(0, 7);

  // 1. Fetch PGs to process
  let pgQuery = supabaseAdmin.from('pgs').select('id, name, upi_id, phone');
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

    // 3. Find pending or overdue rent records that are unpaid
    const { data: rentRecords, error: rentError } = await supabaseAdmin
      .from('rent_records')
      .select('*, tenant:tenants(id, user_id, full_name, phone, status, move_in_date), room:rooms(room_number, base_rent_paise)')
      .eq('pg_id', pg.id)
      .in('status', ['pending', 'overdue'])
      .is('paid_date', null)
      .order('due_date', { ascending: true });

    if (rentError || !rentRecords) {
      console.warn(`[Reminders] Could not fetch rent records for PG ${pg.id}:`, rentError?.message);
      continue;
    }

    // 4. Fetch electricity bills for this PG and month to know finalized state
    const { data: electricityBills } = await supabaseAdmin
      .from('electricity_bills')
      .select('*')
      .eq('pg_id', pg.id)
      .eq('month', currentMonthStr);

    const elBillMap = new Map<string, any>();
    if (electricityBills) {
      for (const b of electricityBills) {
        elBillMap.set(b.tenant_id, b);
      }
    }

    const eligibleRecords: any[] = [];

    for (const record of rentRecords) {
      const tenant = record.tenant as any;
      if (!tenant || tenant.status !== 'active') continue;

      // STOP IMMEDIATELY if marked paid or paid_date exists
      if (record.status === 'paid' || record.paid_date) continue;

      // Pause automated reminder if tenant has submitted a payment awaiting admin verification
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
        continue;
      }

      // Check persistent daily rate limit from record.notes
      let parsedNotes: any = {};
      if (record.notes) {
        try { parsedNotes = JSON.parse(record.notes); } catch {}
      }

      if (isSentToday(parsedNotes.last_reminder_sent_at)) {
        console.log(`[Reminders] Skipping ${tenant.full_name}: reminder already sent today in IST. Strict 1 message/day.`);
        totalSkippedAlreadySent++;
        continue;
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

    // 5. Staggered dispatch across tenants throughout the day (5 to 10 minutes between tenants)
    let staggerIndex = 0;
    let accumulatedStaggerMs = 0;

    for (const record of eligibleRecords) {
      const tenant = record.tenant as any;
      const tenantPhone = tenant.phone?.replace(/\D/g, '') || '';

      if (!tenantPhone || tenantPhone.length < 10) {
        totalSkippedNoPhone++;
        continue;
      }

      const dedupKey = `reminder:rent:${pg.id}:${tenant.id}:${formatDateDMY(now)}`;

      let staggerDelayMs = 0;
      if (staggerIndex > 0) {
        const randomGapMs = 300_000 + Math.floor(Math.random() * 300_000);
        staggerDelayMs = accumulatedStaggerMs + randomGapMs;
        accumulatedStaggerMs = staggerDelayMs;
      } else {
        staggerDelayMs = 30_000;
        accumulatedStaggerMs = 30_000;
      }
      staggerIndex++;

      const scheduledDate = new Date(Date.now() + staggerDelayMs);
      const scheduledISTHour = new Date(scheduledDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
      if (scheduledISTHour >= 21 || scheduledISTHour < 6) {
        console.log(`[Reminders] Tenant ${tenant.full_name} would be sent outside daytime hours (~${scheduledISTHour}:00 IST). Postponing.`);
        await cache.del(dedupKey);
        continue;
      }

      setTimeout(async () => {
        try {
          // Double-check fresh DB state before dispatching
          const { data: freshRecord } = await supabaseAdmin
            .from('rent_records')
            .select('id, status, paid_date, notes')
            .eq('id', record.id)
            .single();

          if (!freshRecord || freshRecord.status === 'paid' || freshRecord.paid_date) {
            return;
          }

          let freshNotes: any = {};
          try { freshNotes = JSON.parse(freshRecord.notes || '{}'); } catch {}

          if (isSentToday(freshNotes.last_reminder_sent_at)) {
            console.log(`[Reminders] Fresh check: reminder for ${tenant.full_name} was already sent today. Aborting.`);
            return;
          }

          await sendSingleRentReminder(pg.id, tenant.id, currentMonthStr);
          await cache.setWithExpiry(dedupKey, 'sent', 86400);
        } catch (err: any) {
          console.error(`[Reminders] Failed to dispatch automated reminder to ${tenant.full_name}:`, err.message);
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
 * Runs once every hour, strictly checking persistent DB timestamps and enforcing 1 message per day.
 */
export function startReminderCron(): void {
  if (cronInterval) return;

  console.log('[Reminders] Starting automated rent reminder scheduler (hourly check, strictly 1 message/day per tenant, persistent counter)...');

  setTimeout(() => {
    checkAndSendRentReminders().catch((err) => {
      console.error('[Reminders] Initial check error:', err.message);
    });
  }, 120_000);

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
