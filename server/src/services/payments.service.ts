import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';
import { sendWhatsAppMessage } from './whatsapp.service';
import { formatDateDMY } from '../utils/date';
import crypto from 'crypto';

export async function listPayments(
  pgId: string,
  filters?: {
    tenant_id?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
) {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('payments')
    .select('*, tenant:tenants(full_name, phone, email)', { count: 'exact' })
    .eq('pg_id', pgId);

  if (filters?.tenant_id) query = query.eq('tenant_id', filters.tenant_id);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0, page, limit };
}

export async function getPayment(pgId: string, id: string, tenantId?: string) {
  let query = supabaseAdmin
    .from('payments')
    .select('*, tenant:tenants(full_name, phone, email)')
    .eq('id', id)
    .eq('pg_id', pgId);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query.single();
  if (error || !data) throw new Error('Payment not found');
  return data;
}

export async function submitPayment(
  pgId: string,
  tenantId: string,
  paymentData: {
    rent_record_id?: string | null;
    electricity_bill_id?: string | null;
    amount_paise: number;
    payment_method: string;
    notes?: string | null;
    utr_id?: string | null;
    reference_id?: string | null;
  },
  screenshotPath?: string | null
) {
  const { utr_id, reference_id, notes, ...rest } = paymentData;
  const utr = (utr_id || reference_id || '').trim();
  let finalNotes = notes?.trim() || null;
  if (utr) {
    finalNotes = finalNotes ? `UTR: ${utr} | ${finalNotes}` : `UTR: ${utr}`;
  }

  const { data, error } = await supabaseAdmin
    .from('payments')
    .insert({
      pg_id: pgId,
      tenant_id: tenantId,
      ...rest,
      notes: finalNotes,
      screenshot_path: screenshotPath || null,
      status: 'submitted',
    })
    .select('*, tenant:tenants(full_name, phone, email)')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function verifyPayment(
  pgId: string,
  id: string,
  status: 'verified' | 'rejected',
  actor: { id: string; email: string },
  rejectionReason?: string | null
) {
  // First check payment and enforce immutability
  const { data: existingPayment, error: fetchError } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('id', id)
    .eq('pg_id', pgId)
    .single();

  if (fetchError || !existingPayment) {
    throw new Error('Payment record not found');
  }

  if (existingPayment.status !== 'submitted') {
    throw new Error(`Cannot modify a finalized payment. Current status is already '${existingPayment.status}'. Financial records are immutable.`);
  }

  const updateData: Record<string, unknown> = {
    status,
    verified_by: actor.id,
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (status === 'rejected' && rejectionReason) {
    updateData.rejection_reason = rejectionReason;
  }

  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .update(updateData)
    .eq('id', id)
    .eq('pg_id', pgId)
    .select('*, tenant:tenants(full_name)')
    .single();

  if (error) throw new Error(error.message);

  // If verified, update the linked rent record or electricity bill status
  if (status === 'verified') {
    if (payment.rent_record_id) {
      await supabaseAdmin
        .from('rent_records')
        .update({ status: 'paid', paid_date: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', payment.rent_record_id)
        .eq('pg_id', pgId);
    } else if (payment.tenant_id) {
      // Find latest pending/overdue rent record for this tenant and mark it paid
      const { data: latestPending } = await supabaseAdmin
        .from('rent_records')
        .select('id')
        .eq('pg_id', pgId)
        .eq('tenant_id', payment.tenant_id)
        .in('status', ['pending', 'overdue'])
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestPending) {
        await supabaseAdmin
          .from('rent_records')
          .update({ status: 'paid', paid_date: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', latestPending.id)
          .eq('pg_id', pgId);

        await supabaseAdmin
          .from('payments')
          .update({ rent_record_id: latestPending.id })
          .eq('id', id);
      }
    }
    if (payment.electricity_bill_id) {
      await supabaseAdmin
        .from('electricity_bills')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', payment.electricity_bill_id)
        .eq('pg_id', pgId);
    }
  }

  // Create notification for tenant
  await supabaseAdmin.from('notifications').insert({
    user_id: payment.tenant_id,
    title: status === 'verified' ? 'Payment Verified' : 'Payment Rejected',
    message: status === 'verified'
      ? `Your payment of ₹${(payment.amount_paise / 100).toFixed(2)} has been verified.`
      : `Your payment was rejected. Reason: ${rejectionReason || 'Not specified'}`,
    type: status === 'verified' ? 'payment_verified' : 'payment_rejected',
    is_read: false,
    metadata: { payment_id: id },
  });

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: status === 'verified' ? 'VERIFY_PAYMENT' : 'REJECT_PAYMENT',
    entityType: 'payment',
    entityId: id,
    details: { status, rejection_reason: rejectionReason },
  });

  // If verified, send automated WhatsApp receipt to the resident
  if (status === 'verified') {
    try {
      await sendPaymentReceiptWhatsApp(pgId, id);
    } catch (waErr: any) {
      console.warn(`[Payments] WhatsApp receipt dispatch error: ${waErr?.message}`);
    }
  }

  return payment;
}

export async function sendPaymentReceiptWhatsApp(pgId: string, paymentId: string) {
  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .select('*, tenant:tenants(full_name, phone, room:rooms(room_number))')
    .eq('id', paymentId)
    .eq('pg_id', pgId)
    .single();

  if (error || !payment) throw new Error('Payment record not found');
  if (!payment.tenant?.phone) throw new Error('Tenant has no registered phone number');

  const { data: pg } = await supabaseAdmin
    .from('pgs')
    .select('name, address, phone')
    .eq('id', pgId)
    .single();

  const pgName = pg?.name || 'Sagar PG';
  const tenantName = payment.tenant.full_name || 'Resident';
  const roomNumber = (payment.tenant as any).room?.room_number ? `Room ${(payment.tenant as any).room.room_number}` : 'N/A';
  const amountFormatted = `₹${(payment.amount_paise / 100).toLocaleString('en-IN')}`;
  const receiptNo = `REC-${payment.id.slice(0, 8).toUpperCase()}`;
  const dateFormatted = formatDateDMY(payment.verified_at || payment.created_at);

  const receiptMsg =
    `🧾 *PAYMENT RECEIPT — ${pgName.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Receipt No: *${receiptNo}*\n` +
    `Date: *${dateFormatted}*\n` +
    `Tenant: *${tenantName}*\n` +
    `Room: *${roomNumber}*\n\n` +
    `💰 *Amount Paid: ${amountFormatted}*\n` +
    `Payment Method: *${(payment.payment_method || 'UPI').toUpperCase()}*\n` +
    `Status: *✅ VERIFIED & ACCEPTED*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you! This is an immutable digital receipt recorded by ${pgName}.`;

  await sendWhatsAppMessage(payment.tenant.phone, receiptMsg);
  return { success: true, message: `Receipt sent to ${payment.tenant.phone}` };
}

export async function uploadPaymentScreenshot(
  pgId: string,
  tenantId: string,
  file: Express.Multer.File
) {
  const ext = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  if (!allowedExts.includes(ext)) {
    throw new Error('File type not allowed. Allowed: jpg, jpeg, png, webp, pdf');
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedMimes.includes(file.mimetype)) {
    throw new Error('Invalid file type');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File size exceeds 5MB limit');
  }

  const safeFilename = `${pgId}/${tenantId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from('payment-screenshots')
    .upload(safeFilename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw new Error(error.message);
  return data.path;
}

