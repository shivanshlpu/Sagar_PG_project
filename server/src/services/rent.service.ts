import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';
import { getBillingSettings } from './settings.service';
import { sendWhatsAppMessage, decodeBase64Image } from './whatsapp.service';
import { formatDateDMY, formatMonthMY } from '../utils/date';

export async function ensureCurrentMonthRent(pgId: string, targetMonth?: string) {
  const month = targetMonth || new Date().toISOString().slice(0, 7);
  try {
    const billingSettings = await getBillingSettings(pgId);

    // Get active tenants in this PG with room assignments
    const { data: tenants, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, room_id, bed_id, rooms(base_rent_paise)')
      .eq('pg_id', pgId)
      .eq('status', 'active')
      .not('room_id', 'is', null);

    if (tenantErr || !tenants || tenants.length === 0) return [];

    // Check which tenants already have a record for this month
    const { data: existingRecords } = await supabaseAdmin
      .from('rent_records')
      .select('tenant_id')
      .eq('pg_id', pgId)
      .eq('month', month)
      .in('tenant_id', tenants.map((t) => t.id));

    const existingTenantIds = new Set(existingRecords?.map((r) => r.tenant_id) || []);
    const missingTenants = tenants.filter((t) => !existingTenantIds.has(t.id));

    if (missingTenants.length === 0) return [];

    // Fetch electricity bills for this month if any
    const { data: existingElBills } = await supabaseAdmin
      .from('electricity_bills')
      .select('id, tenant_id, units_consumed, rate_per_unit_paise, total_amount_paise')
      .eq('pg_id', pgId)
      .eq('month', month)
      .in('tenant_id', missingTenants.map((t) => t.id));

    const elBillMap = new Map<string, any>();
    if (existingElBills) {
      for (const b of existingElBills) {
        elBillMap.set(b.tenant_id, b);
      }
    }

    const records = missingTenants.map((tenant) => {
      const tenantData = tenant as any;
      const baseRent = Array.isArray(tenantData.rooms)
        ? (tenantData.rooms[0]?.base_rent_paise || 0)
        : (tenantData.rooms?.base_rent_paise || 0);

      const maintenance = billingSettings.maintenance_charge_paise || 0;
      const elBill = elBillMap.get(tenant.id);
      const elAmount = elBill?.total_amount_paise || 0;
      const totalDue = baseRent + maintenance + elAmount;

      const itemizedNotes = JSON.stringify({
        base_rent_paise: baseRent,
        maintenance_paise: maintenance,
        electricity_bill_id: elBill?.id || null,
        electricity_units: elBill?.units_consumed || 0,
        electricity_rate_per_unit_paise: elBill?.rate_per_unit_paise || billingSettings.electricity_rate_per_unit_paise,
        electricity_amount_paise: elAmount,
        total_due_paise: totalDue,
      });

      return {
        pg_id: pgId,
        tenant_id: tenant.id,
        room_id: tenant.room_id,
        month,
        rent_amount_paise: baseRent,
        late_fee_paise: 0,
        total_due_paise: totalDue,
        status: 'pending',
        due_date: `${month}-05T00:00:00Z`,
        notes: itemizedNotes,
      };
    });

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('rent_records')
      .insert(records)
      .select();

    if (insertError) {
      console.warn('[RentService] Auto-generation notice:', insertError.message);
      return [];
    }
    return inserted || [];
  } catch (err: any) {
    console.warn('[RentService] Failed in ensureCurrentMonthRent:', err?.message);
    return [];
  }
}

export async function listRentRecords(
  pgId: string,
  filters?: {
    month?: string;
    room_id?: string;
    tenant_id?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
) {
  // Automatically ensure current month rent records exist for all active tenants
  const currentMonth = new Date().toISOString().slice(0, 7);
  await ensureCurrentMonthRent(pgId, filters?.month || currentMonth);

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('rent_records')
    .select('*, tenant:tenants(full_name, phone, email), room:rooms(room_number)', { count: 'exact' })
    .eq('pg_id', pgId);

  if (filters?.month) query = query.eq('month', filters.month);
  if (filters?.room_id) query = query.eq('room_id', filters.room_id);
  if (filters?.tenant_id) query = query.eq('tenant_id', filters.tenant_id);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0, page, limit };
}

export async function getRentRecord(pgId: string, id: string, tenantId?: string) {
  let query = supabaseAdmin
    .from('rent_records')
    .select('*, tenant:tenants(full_name, phone, email), room:rooms(room_number)')
    .eq('id', id)
    .eq('pg_id', pgId);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query.single();
  if (error || !data) throw new Error('Rent record not found');
  return data;
}

export async function generateRentRecords(
  pgId: string,
  month: string,
  tenantIds?: string[],
  dueDate?: string,
  actor?: { id: string; email: string }
) {
  // Get billing settings for default maintenance charge & electricity rate
  const billingSettings = await getBillingSettings(pgId);

  // Get active tenants in this PG with room assignments
  let query = supabaseAdmin
    .from('tenants')
    .select('id, room_id, bed_id, rooms(base_rent_paise)')
    .eq('pg_id', pgId)
    .eq('status', 'active')
    .not('room_id', 'is', null);

  if (tenantIds && tenantIds.length > 0) {
    query = query.in('id', tenantIds);
  }

  const { data: tenants, error } = await query;
  if (error) throw new Error(error.message);

  if (!tenants || tenants.length === 0) {
    throw new Error('No active tenants with room assignments found');
  }

  // Check for existing records to prevent duplicates in this PG
  const existingCheck = await supabaseAdmin
    .from('rent_records')
    .select('tenant_id')
    .eq('pg_id', pgId)
    .eq('month', month)
    .in('tenant_id', tenants.map(t => t.id));

  const existingTenantIds = new Set(existingCheck.data?.map(r => r.tenant_id) || []);

  // Fetch any pre-existing electricity bills for this month
  const { data: existingElBills } = await supabaseAdmin
    .from('electricity_bills')
    .select('id, tenant_id, units_consumed, rate_per_unit_paise, total_amount_paise')
    .eq('pg_id', pgId)
    .eq('month', month)
    .in('tenant_id', tenants.map(t => t.id));

  const elBillMap = new Map<string, any>();
  if (existingElBills) {
    for (const b of existingElBills) {
      elBillMap.set(b.tenant_id, b);
    }
  }

  const records = tenants
    .filter(t => !existingTenantIds.has(t.id))
    .map(tenant => {
      const tenantData = tenant as any;
      const baseRent = Array.isArray(tenantData.rooms)
        ? (tenantData.rooms[0]?.base_rent_paise || 0)
        : (tenantData.rooms?.base_rent_paise || 0);

      const maintenance = billingSettings.maintenance_charge_paise || 0;
      const elBill = elBillMap.get(tenant.id);
      const elAmount = elBill?.total_amount_paise || 0;
      const totalDue = baseRent + maintenance + elAmount;

      const itemizedNotes = JSON.stringify({
        base_rent_paise: baseRent,
        maintenance_paise: maintenance,
        electricity_bill_id: elBill?.id || null,
        electricity_units: elBill?.units_consumed || 0,
        electricity_rate_per_unit_paise: elBill?.rate_per_unit_paise || billingSettings.electricity_rate_per_unit_paise,
        electricity_amount_paise: elAmount,
        total_due_paise: totalDue,
      });

      return {
        pg_id: pgId,
        tenant_id: tenant.id,
        room_id: tenant.room_id,
        month,
        rent_amount_paise: baseRent,
        late_fee_paise: 0,
        total_due_paise: totalDue,
        status: 'pending',
        due_date: dueDate || `${month}-05T00:00:00Z`, // Default due: 5th of the month
        notes: itemizedNotes,
      };
    });

  if (records.length === 0) {
    throw new Error('Rent records already exist for all specified tenants this month');
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('rent_records')
    .insert(records)
    .select();

  if (insertError) throw new Error(insertError.message);

  if (actor) {
    await logAudit({
      pgId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'GENERATE_RENT_RECORDS',
      entityType: 'rent_record',
      entityId: month,
      details: { count: records.length, month },
    });
  }

  return inserted;
}

export async function updateRentRecord(
  pgId: string,
  id: string,
  updates: { status?: string; late_fee_paise?: number; notes?: string | null },
  actor: { id: string; email: string }
) {
  // Ensure record exists in PG
  const existing = await getRentRecord(pgId, id);

  const updateData: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  // Recalculate total if late fee changed
  if (updates.late_fee_paise !== undefined) {
    // If notes has itemized breakdown, use sum of components
    let baseDue = existing.rent_amount_paise;
    if (existing.notes) {
      try {
        const parsed = JSON.parse(existing.notes);
        if (parsed.base_rent_paise !== undefined) {
          baseDue = (parsed.base_rent_paise || 0) + (parsed.maintenance_paise || 0) + (parsed.electricity_amount_paise || 0);
        }
      } catch {
        // fallback
      }
    }
    updateData.total_due_paise = baseDue + updates.late_fee_paise;
  }

  if (updates.status === 'paid') {
    updateData.paid_date = new Date().toISOString();
    // Check if a payment record already exists for this rent record
    try {
      const { data: existingPayment } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('pg_id', pgId)
        .eq('rent_record_id', id)
        .maybeSingle();

      if (!existingPayment) {
        await supabaseAdmin.from('payments').insert({
          pg_id: pgId,
          tenant_id: existing.tenant_id,
          rent_record_id: id,
          amount_paise: updateData.total_due_paise ?? existing.total_due_paise,
          payment_method: 'CASH', // default when marked directly paid by admin
          notes: `Marked paid by admin (${actor.email}) for month ${existing.month}`,
          status: 'verified',
          verified_by: actor.id,
          verified_at: new Date().toISOString(),
        });
      }
    } catch (payErr: any) {
      console.warn('[RentService] Auto-create payment entry notice:', payErr?.message);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('rent_records')
    .update(updateData)
    .eq('id', id)
    .eq('pg_id', pgId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_RENT_RECORD',
    entityType: 'rent_record',
    entityId: id,
    details: updates,
  });

  return data;
}

export async function getTenantRentHistory(pgId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('rent_records')
    .select('*, room:rooms(room_number)')
    .eq('pg_id', pgId)
    .eq('tenant_id', tenantId)
    .order('month', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getTenantBillingSummary(pgId: string, tenantId: string) {
  // Ensure ongoing month rent record is created for this PG
  await ensureCurrentMonthRent(pgId);

  // 1. Fetch tenant with room
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, full_name, phone, email, room_id, bed_id, move_in_date, status, room:rooms(room_number, floor, room_type, base_rent_paise)')
    .eq('id', tenantId)
    .eq('pg_id', pgId)
    .single();

  if (tenantError || !tenant) throw new Error('Tenant not found');

  // 2. Fetch billing settings (configured rates)
  const billingSettings = await getBillingSettings(pgId);

  // 3. Fetch all rent records for tenant
  const { data: rentRecords } = await supabaseAdmin
    .from('rent_records')
    .select('*, room:rooms(room_number)')
    .eq('pg_id', pgId)
    .eq('tenant_id', tenantId)
    .order('month', { ascending: false });

  // 4. Fetch all electricity bills for tenant
  const { data: electricityBills } = await supabaseAdmin
    .from('electricity_bills')
    .select('*, room:rooms(room_number)')
    .eq('pg_id', pgId)
    .eq('tenant_id', tenantId)
    .order('month', { ascending: false });

  // 5. Fetch all payments for tenant
  const { data: payments } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('pg_id', pgId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  // 6. Compute current active due
  // Look for the latest unpaid record or latest record
  const allRent = rentRecords || [];
  const latestPendingRecord = allRent.find(r => ['pending', 'overdue'].includes(r.status)) || allRent[0];

  const tenantRoom = tenant.room as any;
  const baseRentPaise = tenantRoom?.base_rent_paise || 0;
  const maintenancePaise = billingSettings.maintenance_charge_paise || 50000;
  const defaultRate = billingSettings.electricity_rate_per_unit_paise || 1200;

  let currentDue = {
    rent_record_id: latestPendingRecord?.id || null,
    month: latestPendingRecord?.month || new Date().toISOString().slice(0, 7),
    base_rent_paise: baseRentPaise,
    maintenance_paise: maintenancePaise,
    electricity_units: 0,
    electricity_rate_per_unit_paise: defaultRate,
    electricity_amount_paise: 0,
    late_fee_paise: latestPendingRecord?.late_fee_paise || 0,
    total_due_paise: baseRentPaise + maintenancePaise,
    status: latestPendingRecord?.status || 'pending',
    due_date: latestPendingRecord?.due_date || `${new Date().toISOString().slice(0, 7)}-05T00:00:00Z`,
  };

  if (latestPendingRecord) {
    let parsedNotes: Record<string, any> = {};
    if (latestPendingRecord.notes) {
      try {
        parsedNotes = JSON.parse(latestPendingRecord.notes);
      } catch {
        // raw note
      }
    }

    // Match electricity bill for that record's month
    const elForMonth = (electricityBills || []).find(b => b.month === latestPendingRecord.month);

    const base = parsedNotes.base_rent_paise ?? (latestPendingRecord.rent_amount_paise || baseRentPaise);
    const maint = parsedNotes.maintenance_paise ?? maintenancePaise;
    const elUnits = elForMonth?.units_consumed ?? parsedNotes.electricity_units ?? 0;
    const elRate = elForMonth?.rate_per_unit_paise ?? parsedNotes.electricity_rate_per_unit_paise ?? defaultRate;
    const elAmount = elForMonth?.total_amount_paise ?? parsedNotes.electricity_amount_paise ?? (elUnits * elRate);
    const late = latestPendingRecord.late_fee_paise || 0;
    const total = parsedNotes.total_due_paise ?? latestPendingRecord.total_due_paise ?? (base + maint + elAmount + late);

    currentDue = {
      rent_record_id: latestPendingRecord.id,
      month: latestPendingRecord.month,
      base_rent_paise: base,
      maintenance_paise: maint,
      electricity_units: elUnits,
      electricity_rate_per_unit_paise: elRate,
      electricity_amount_paise: elAmount,
      late_fee_paise: late,
      total_due_paise: total,
      status: latestPendingRecord.status,
      due_date: latestPendingRecord.due_date,
    };
  }

  return {
    tenant: {
      id: tenant.id,
      full_name: tenant.full_name,
      phone: tenant.phone,
      email: tenant.email,
      room_number: tenantRoom?.room_number || 'Unassigned',
      floor: tenantRoom?.floor ?? 0,
      room_type: tenantRoom?.room_type || 'single',
      base_rent_paise: baseRentPaise,
    },
    billingSettings,
    currentDue,
    rentRecords: allRent,
    electricityBills: electricityBills || [],
    payments: payments || [],
  };
}

export async function sendRentBillWhatsApp(pgId: string, rentRecordId: string) {
  const { data: record, error } = await supabaseAdmin
    .from('rent_records')
    .select('*, tenant:tenants(full_name, phone), room:rooms(room_number)')
    .eq('id', rentRecordId)
    .eq('pg_id', pgId)
    .single();

  if (error || !record) throw new Error('Rent record not found');
  if (!record.tenant?.phone) throw new Error('Tenant has no registered phone number');

  const { data: pg } = await supabaseAdmin
    .from('pgs')
    .select('name, address, phone, upi_id, bank_name, account_number, ifsc_code, account_holder_name')
    .eq('id', pgId)
    .single();

  const { data: qrData } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', `payment_qr_${pgId}`)
    .maybeSingle();

  const paymentQrStr = qrData?.value ? (typeof qrData.value === 'string' ? qrData.value : (qrData.value.qr || qrData.value.url || null)) : null;
  const qrBuffer = paymentQrStr ? decodeBase64Image(paymentQrStr) : null;

  const pgName = pg?.name || 'Sagar PG';
  const tenantName = (record.tenant as any)?.full_name || 'Resident';
  const roomNumber = (record.room as any)?.room_number ? `Room ${(record.room as any).room_number}` : 'N/A';
  const totalAmount = `₹${(record.total_due_paise / 100).toLocaleString('en-IN')}`;
  const dueDateFormatted = formatDateDMY(record.due_date);
  const invoiceNo = `INV-${record.month.replace('-', '')}-${record.id.slice(0, 6).toUpperCase()}`;

  let paymentDetails = '';
  if (pg?.upi_id) {
    paymentDetails += `• UPI ID: *${pg.upi_id}*\n`;
  }
  if (pg?.account_number) {
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

  const invoiceMsg =
    `📋 *RENT INVOICE — ${pgName.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Dear *${tenantName}*,\n\n` +
    `Invoice: *${invoiceNo}*\n` +
    `Month: *${formatMonthMY(record.month)}*\n` +
    `👤 *Tenant*: *${tenantName}*\n` +
    `🏠 *Room*: *${roomNumber}*\n\n` +
    `💵 *Total Due: ${totalAmount}*\n` +
    `Due Date: *${dueDateFormatted}*\n` +
    `Status: *${record.status.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    (paymentDetails ? `*Payment Details*:\n${paymentDetails}\n` : '') +
    `After paying, enter your UTR / Reference ID in the resident portal so we can verify and mark it as paid.`;

  await sendWhatsAppMessage(record.tenant.phone, invoiceMsg, { pgId: record.pg_id, imageBuffer: qrBuffer });
  return { success: true, message: `Invoice sent to ${record.tenant.phone}` };
}

