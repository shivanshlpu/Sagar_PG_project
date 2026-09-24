import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';
import { sendWhatsAppMessage } from './whatsapp.service';
import { sendRentBillWhatsApp, generateRentRecords } from './rent.service';
import { formatDateDMY, formatMonthMY } from '../utils/date';
import { generateRentInvoicePdf } from './invoicePdf.service';
import { getWhatsAppMessageTemplates, renderWhatsAppTemplate } from './settings.service';
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
    .select('*, tenant:tenants(full_name, phone, email, room:rooms(room_number, floor))', { count: 'exact' })
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
    sender_name?: string | null;
  },
  screenshotPath?: string | null
) {
  // 1. Cross-Tenant Integrity Check: Verify linked rent record belongs strictly to this tenant and PG
  if (paymentData.rent_record_id) {
    const { data: rentRecord, error: rentErr } = await supabaseAdmin
      .from('rent_records')
      .select('id')
      .eq('id', paymentData.rent_record_id)
      .eq('pg_id', pgId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (rentErr || !rentRecord) {
      throw new Error('[Tenant Isolation Violation] The selected rent record does not belong to your account or PG property.');
    }
  }

  // 2. Cross-Tenant Integrity Check: Verify linked electricity bill belongs strictly to this tenant and PG
  if (paymentData.electricity_bill_id) {
    const { data: elBill, error: elErr } = await supabaseAdmin
      .from('electricity_bills')
      .select('id')
      .eq('id', paymentData.electricity_bill_id)
      .eq('pg_id', pgId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (elErr || !elBill) {
      throw new Error('[Tenant Isolation Violation] The selected electricity bill does not belong to your account or PG property.');
    }
  }

  const { utr_id, reference_id, sender_name, notes, ...rest } = paymentData;
  const utr = (utr_id || reference_id || '').trim();
  const sender = (sender_name || '').trim();

  const noteParts: string[] = [];
  if (utr) noteParts.push(`UTR: ${utr}`);
  if (sender) noteParts.push(`Sender: ${sender}`);
  if (notes?.trim()) noteParts.push(notes.trim());
  const finalNotes = noteParts.length > 0 ? noteParts.join(' | ') : null;

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
  let linkedRentRecordId = payment.rent_record_id;
  if (status === 'verified') {
    if (linkedRentRecordId) {
      await supabaseAdmin
        .from('rent_records')
        .update({ status: 'paid', paid_date: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', linkedRentRecordId)
        .eq('pg_id', pgId);
    } else if (payment.tenant_id) {
      // Find matching rent record for this tenant: pending/overdue first, or matching payment month
      let { data: targetRent } = await supabaseAdmin
        .from('rent_records')
        .select('id')
        .eq('pg_id', pgId)
        .eq('tenant_id', payment.tenant_id)
        .in('status', ['pending', 'overdue'])
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!targetRent) {
        const payMonth = payment.created_at ? payment.created_at.slice(0, 7) : new Date().toISOString().slice(0, 7);
        const { data: monthRent } = await supabaseAdmin
          .from('rent_records')
          .select('id')
          .eq('pg_id', pgId)
          .eq('tenant_id', payment.tenant_id)
          .eq('month', payMonth)
          .maybeSingle();
        targetRent = monthRent;

        if (!targetRent) {
          try {
            const generated = await generateRentRecords(pgId, payMonth, [payment.tenant_id]);
            if (generated && generated.length > 0) {
              targetRent = generated[0];
            }
          } catch (genErr) {
            console.warn('[Payments] On-demand rent record creation notice:', genErr);
          }
        }
      }

      if (targetRent) {
        linkedRentRecordId = targetRent.id;
        payment.rent_record_id = targetRent.id;

        await supabaseAdmin
          .from('rent_records')
          .update({ status: 'paid', paid_date: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', targetRent.id)
          .eq('pg_id', pgId);

        await supabaseAdmin
          .from('payments')
          .update({ rent_record_id: targetRent.id })
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

  // If verified, automatically send official WhatsApp verified bill / receipt with PG branding
  if (status === 'verified') {
    try {
      if (linkedRentRecordId) {
        await sendRentBillWhatsApp(pgId, linkedRentRecordId);
      } else {
        await sendPaymentReceiptWhatsApp(pgId, id);
      }
    } catch (waErr: any) {
      console.warn(`[Payments] WhatsApp bill/receipt dispatch error: ${waErr?.message}`);
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

  // If this payment is linked to a rent record (or we can find the matching monthly record), dispatch the official branded bill
  let rentRecordId = payment.rent_record_id;
  if (!rentRecordId && payment.tenant_id) {
    const payMonth = payment.created_at ? payment.created_at.slice(0, 7) : new Date().toISOString().slice(0, 7);
    const { data: rRecord } = await supabaseAdmin
      .from('rent_records')
      .select('id')
      .eq('pg_id', pgId)
      .eq('tenant_id', payment.tenant_id)
      .or(`month.eq.${payMonth},status.eq.paid`)
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rRecord) {
      rentRecordId = rRecord.id;
      await supabaseAdmin.from('payments').update({ rent_record_id: rRecord.id }).eq('id', paymentId);
    }
  }

  if (rentRecordId) {
    return await sendRentBillWhatsApp(pgId, rentRecordId);
  }

  if (!payment.tenant?.phone) throw new Error('Tenant has no registered phone number');

  const { data: pg } = await supabaseAdmin
    .from('pgs')
    .select('id, name, address, phone, email, owner_name, tagline, upi_id, bank_name, account_number, ifsc_code, account_holder_name, logo_url')
    .eq('id', pgId)
    .single();

  const pgName = pg?.name || 'Sagar PG';
  const tenantName = payment.tenant.full_name || 'Resident';
  const roomNumber = (payment.tenant as any).room?.room_number || 'N/A';
  const dateFormatted = formatDateDMY(payment.verified_at || payment.created_at);
  const payMonth = payment.created_at ? payment.created_at.slice(0, 7) : new Date().toISOString().slice(0, 7);

  const synthRecord = {
    id: payment.id,
    month: payMonth,
    rent_amount_paise: payment.amount_paise,
    late_fee_paise: 0,
    total_due_paise: payment.amount_paise,
    status: 'paid',
    due_date: payment.created_at || new Date().toISOString(),
    paid_date: payment.verified_at || payment.created_at,
    notes: JSON.stringify({
      base_rent_paise: payment.amount_paise,
      utr: payment.utr,
      pg_snapshot: pg,
    }),
    tenant: payment.tenant,
    room: (payment.tenant as any).room,
    pg,
  };

  const pdfBuffer = await generateRentInvoicePdf(pgId, synthRecord);
  const templates = await getWhatsAppMessageTemplates(pgId);
  const vars: Record<string, string | number> = {
    tenant_name: tenantName,
    room_number: roomNumber,
    month: formatMonthMY(payMonth),
    amount: (payment.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    due_date: dateFormatted,
    units: 0,
    pg_name: pgName,
    upi_id: pg?.upi_id || '',
  };

  const shortMessage = renderWhatsAppTemplate(templates.bill_verified_message, vars);

  await sendWhatsAppMessage(payment.tenant.phone, shortMessage, {
    pgId: payment.pg_id,
    purpose: 'PAYMENT_RECEIPT',
    documentBuffer: pdfBuffer,
    fileName: `Receipt-${payment.id.slice(0, 8)}.pdf`,
    mimetype: 'application/pdf',
  });

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

