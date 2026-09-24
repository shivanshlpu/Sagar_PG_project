import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';
import { getBillingSettings, getWhatsAppMessageTemplates, renderWhatsAppTemplate } from './settings.service';
import { sendWhatsAppMessage } from './whatsapp.service';
import { getPG } from './pg.service';
import { formatDateDMY, formatMonthMY } from '../utils/date';
import { generateRentInvoicePdf } from './invoicePdf.service';

export function calculateTenantDueDate(month: string, moveInDate?: string | null, fallbackDay: number = 5): string {
  let day = fallbackDay;
  if (moveInDate) {
    const d = new Date(moveInDate).getDate();
    if (!isNaN(d) && d >= 1 && d <= 31) {
      day = d;
    }
  }
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const maxDays = new Date(year, m, 0).getDate();
  const clampedDay = Math.min(day, maxDays);
  return `${month}-${String(clampedDay).padStart(2, '0')}T00:00:00Z`;
}

export async function ensureCurrentMonthRent(pgId: string, targetMonth?: string) {
  const month = targetMonth || new Date().toISOString().slice(0, 7);
  try {
    const billingSettings = await getBillingSettings(pgId);

    // Get active tenants in this PG with room assignments and move_in_date for cycle calculation
    const { data: tenants, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, room_id, bed_id, move_in_date, rooms(base_rent_paise)')
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

    let pgProfileSnapshot: any = null;
    try {
      const p = await getPG(pgId);
      pgProfileSnapshot = {
        name: p.name,
        owner_name: p.owner_name || null,
        tagline: p.tagline || 'PREMIUM PG LIVING',
        address: p.address || null,
        city: p.city || null,
        state: p.state || null,
        pincode: p.pincode || null,
        phone: p.phone || null,
        email: p.email || null,
        logo_url: p.logo_url || null,
        upi_id: p.upi_id || null,
        bank_name: p.bank_name || null,
        account_number: p.account_number || null,
        ifsc_code: p.ifsc_code || null,
        account_holder_name: p.account_holder_name || null,
      };
    } catch {
      // Gracefully proceed if PG profile cannot be resolved
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
        pg_snapshot: pgProfileSnapshot,
      });

      // Tenant's due date is their individual cycle completion date based on move-in day
      const tenantDueDate = calculateTenantDueDate(month, tenantData.move_in_date, 5);

      return {
        pg_id: pgId,
        tenant_id: tenant.id,
        room_id: tenant.room_id,
        month,
        rent_amount_paise: baseRent,
        late_fee_paise: 0,
        total_due_paise: totalDue,
        status: 'pending',
        due_date: tenantDueDate,
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

  let pgProfile: any = null;
  try {
    pgProfile = await getPG(pgId);
  } catch (err) {
    console.warn('[RentService] Failed to load PG profile for rent record:', err);
  }

  return {
    ...data,
    pg: pgProfile,
  };
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

  // Get active tenants in this PG with room assignments and move_in_date
  let query = supabaseAdmin
    .from('tenants')
    .select('id, room_id, bed_id, move_in_date, rooms(base_rent_paise)')
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

  let pgProfileSnapshot: any = null;
  try {
    const p = await getPG(pgId);
    pgProfileSnapshot = {
      name: p.name,
      owner_name: p.owner_name || null,
      tagline: p.tagline || 'PREMIUM PG LIVING',
      address: p.address || null,
      city: p.city || null,
      state: p.state || null,
      pincode: p.pincode || null,
      phone: p.phone || null,
      email: p.email || null,
      logo_url: p.logo_url || null,
      upi_id: p.upi_id || null,
      bank_name: p.bank_name || null,
      account_number: p.account_number || null,
      ifsc_code: p.ifsc_code || null,
      account_holder_name: p.account_holder_name || null,
    };
  } catch {
    // Gracefully proceed
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
        pg_snapshot: pgProfileSnapshot,
      });

      const tenantDueDate = dueDate || calculateTenantDueDate(month, tenantData.move_in_date, 5);

      return {
        pg_id: pgId,
        tenant_id: tenant.id,
        room_id: tenant.room_id,
        month,
        rent_amount_paise: baseRent,
        late_fee_paise: 0,
        total_due_paise: totalDue,
        status: 'pending',
        due_date: tenantDueDate,
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
  } else if (updates.status === 'pending' || updates.status === 'overdue' || updates.status === 'partially_paid') {
    updateData.paid_date = null;
  }

  const { data, error } = await supabaseAdmin
    .from('rent_records')
    .update(updateData)
    .eq('id', id)
    .eq('pg_id', pgId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // If marked paid, automatically dispatch verified bill / receipt to tenant WhatsApp
  if (updates.status === 'paid') {
    try {
      await sendRentBillWhatsApp(pgId, id);
      console.log(`[RentService] Automatically sent verified bill to WhatsApp for rent record ${id}`);
    } catch (waErr: any) {
      console.warn('[RentService] Notice dispatching WhatsApp verified bill:', waErr?.message);
    }
  }

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
    pgProfile: await getPG(pgId),
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

  const pg = await getPG(pgId);
  const pgName = pg?.name || 'Sagar PG';
  const tenantName = (record.tenant as any)?.full_name || 'Resident';
  const roomNumber = (record.room as any)?.room_number ? `Room ${(record.room as any).room_number}` : 'N/A';
  const dueDateFormatted = formatDateDMY(record.due_date);
  const monthFormatted = formatMonthMY(record.month);

  // Parse itemized breakdown from notes
  let notesObj: any = {};
  if (record.notes) {
    try {
      notesObj = JSON.parse(record.notes);
    } catch {
      // plain text note
    }
  }

  const baseRentPaise = notesObj.base_rent_paise ?? record.rent_amount_paise;
  const maintenancePaise = notesObj.maintenance_paise ?? 0;
  const electricityPaise = notesObj.electricity_amount_paise ?? 0;
  const electricityUnits = notesObj.electricity_units ?? 0;
  const lateFeePaise = record.late_fee_paise || 0;
  const totalAmountPaise = record.total_due_paise || (baseRentPaise + maintenancePaise + electricityPaise + lateFeePaise);
  const formattedTotal = (totalAmountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const isPaid = record.status === 'paid' || record.status === 'verified';

  // 1. Generate publication-quality PDF invoice attachment
  const pdfBuffer = await generateRentInvoicePdf(pgId, { ...record, pg });

  // 2. Load customizable message template
  const templates = await getWhatsAppMessageTemplates(pgId);
  const vars: Record<string, string | number> = {
    tenant_name: tenantName,
    room_number: roomNumber,
    month: monthFormatted,
    amount: formattedTotal,
    due_date: dueDateFormatted,
    units: electricityUnits,
    pg_name: pgName,
    upi_id: pg?.upi_id || '',
  };

  const shortMessage = renderWhatsAppTemplate(templates.bill_verified_message, vars);
  const cleanFileName = `Bill-${record.month}-${tenantName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

  // 3. Dispatch official PDF document with short, essential message caption
  await sendWhatsAppMessage(record.tenant.phone, shortMessage, {
    pgId: record.pg_id,
    purpose: isPaid ? 'PAYMENT_RECEIPT' : 'INVOICE',
    documentBuffer: pdfBuffer,
    fileName: cleanFileName,
    mimetype: 'application/pdf',
  });

  return { success: true, message: `Official PDF invoice sent to ${record.tenant.phone}` };
}

export async function getRentRecordPdf(pgId: string, rentRecordId: string, tenantId?: string): Promise<Buffer> {
  const query = supabaseAdmin
    .from('rent_records')
    .select('*, tenant:tenants(full_name, phone), room:rooms(room_number)')
    .eq('id', rentRecordId)
    .eq('pg_id', pgId);

  if (tenantId) {
    query.eq('tenant_id', tenantId);
  }

  const { data: record, error } = await query.single();
  if (error || !record) throw new Error('Rent record not found');

  return generateRentInvoicePdf(pgId, record);
}

