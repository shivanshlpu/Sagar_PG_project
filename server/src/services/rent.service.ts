import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';
import { getBillingSettings, getWhatsAppMessageTemplates, renderWhatsAppTemplate } from './settings.service';
import { sendWhatsAppMessage } from './whatsapp.service';
import { getPG } from './pg.service';
import { formatDateDMY, formatMonthMY } from '../utils/date';
import { generateRentInvoicePdf } from './invoicePdf.service';

export function calculateTenantDueDate(month: string, moveInDate?: string | null, fallbackDay: number = 1): string {
  let day = fallbackDay;
  if (moveInDate) {
    const datePart = moveInDate.split('T')[0];
    const parts = datePart.split('-');
    if (parts.length >= 3) {
      const parsedDay = parseInt(parts[2], 10);
      if (!isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
        day = parsedDay;
      }
    }
  }
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const maxDays = new Date(year, m, 0).getDate();
  const clampedDay = Math.min(day, maxDays);
  return `${month}-${String(clampedDay).padStart(2, '0')}T00:00:00Z`;
}

export function isTenantDueForGeneration(
  month: string,
  moveInDate: string | null | undefined,
  todayStr: string
): { isDue: boolean; dueDate: string; reason?: string } {
  // If tenant has move-in date:
  if (moveInDate) {
    const moveInDateStr = moveInDate.split('T')[0];
    const moveInMonth = moveInDateStr.slice(0, 7);
    if (moveInMonth > month) {
      return { isDue: false, dueDate: '', reason: 'Tenant had not moved in yet during this month' };
    }
  }

  const tenantDueDate = calculateTenantDueDate(month, moveInDate, 1);
  const dueDateStr = tenantDueDate.split('T')[0];
  const currentMonthStr = todayStr.slice(0, 7);

  // Future month: never generate in advance
  if (month > currentMonthStr) {
    return { isDue: false, dueDate: tenantDueDate, reason: `Month ${month} is in the future` };
  }

  // Current month: ONLY generate if tenant's specific due date has arrived (due day <= today)
  if (month === currentMonthStr) {
    if (dueDateStr > todayStr) {
      return { isDue: false, dueDate: tenantDueDate, reason: `Due date (${dueDateStr}) has not arrived yet` };
    }
  }

  // Past month or due date has arrived today or earlier
  return { isDue: true, dueDate: tenantDueDate };
}

export async function ensureDueRentRecords(pgId: string, targetMonth?: string) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const currentMonthStr = todayStr.slice(0, 7); // YYYY-MM
  const month = targetMonth || currentMonthStr;

  // Never generate future months in advance
  if (month > currentMonthStr) {
    return [];
  }

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

    // Filter ONLY tenants whose individual due date has actually arrived
    const dueTenants = missingTenants.filter((tenant) => {
      const check = isTenantDueForGeneration(month, tenant.move_in_date, todayStr);
      return check.isDue;
    });

    if (dueTenants.length === 0) return [];

    // Fetch electricity bills for this month if any
    const { data: existingElBills } = await supabaseAdmin
      .from('electricity_bills')
      .select('id, tenant_id, units_consumed, rate_per_unit_paise, total_amount_paise')
      .eq('pg_id', pgId)
      .eq('month', month)
      .in('tenant_id', dueTenants.map((t) => t.id));

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

    const records = dueTenants.map((tenant) => {
      const tenantData = tenant as any;
      const baseRent = Array.isArray(tenantData.rooms)
        ? (tenantData.rooms[0]?.base_rent_paise || 0)
        : (tenantData.rooms?.base_rent_paise || 0);

      const maintenance = billingSettings.maintenance_charge_paise || 0;
      const elBill = elBillMap.get(tenant.id);
      const elAmount = elBill?.total_amount_paise || 0;
      const totalDue = baseRent + maintenance + elAmount;

      const tenantDueDate = calculateTenantDueDate(month, tenantData.move_in_date, 1);

      const itemizedNotes = JSON.stringify({
        base_rent_paise: baseRent,
        maintenance_paise: maintenance,
        electricity_bill_id: elBill?.id || null,
        electricity_units: elBill?.units_consumed || 0,
        electricity_rate_per_unit_paise: elBill?.rate_per_unit_paise || billingSettings.electricity_rate_per_unit_paise,
        electricity_amount_paise: elAmount,
        total_due_paise: totalDue,
        pg_snapshot: pgProfileSnapshot,
        reminder_count: 0,
        last_reminder_sent_at: null,
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
    console.warn('[RentService] Failed in ensureDueRentRecords:', err?.message);
    return [];
  }
}

// Backwards-compatible alias
export const ensureCurrentMonthRent = ensureDueRentRecords;

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
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7);

  // Future month validation for bulk generation
  if ((!tenantIds || tenantIds.length === 0) && month > currentMonthStr) {
    throw new Error('Cannot generate rent for future months in advance. Rent records are generated when each tenant\'s specific due date arrives.');
  }

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

  // Filter ONLY tenants whose individual due date has actually arrived
  const eligibleTenants = tenants
    .filter(t => !existingTenantIds.has(t.id))
    .filter(tenant => {
      // If admin explicitly requested specific tenant IDs, allow generation
      if (tenantIds && tenantIds.length > 0) return true;
      // Otherwise, strictly only generate for tenants whose individual due date has arrived
      const check = isTenantDueForGeneration(month, tenant.move_in_date, todayStr);
      return check.isDue;
    });

  if (eligibleTenants.length === 0) {
    if (existingTenantIds.size === tenants.length) {
      throw new Error(`Rent records already exist for all specified tenants for ${month}`);
    }
    throw new Error(`No tenants have reached their due date for ${month} yet. Rent records are generated when each tenant's specific due date arrives.`);
  }

  // Fetch any pre-existing electricity bills for this month
  const { data: existingElBills } = await supabaseAdmin
    .from('electricity_bills')
    .select('id, tenant_id, units_consumed, rate_per_unit_paise, total_amount_paise')
    .eq('pg_id', pgId)
    .eq('month', month)
    .in('tenant_id', eligibleTenants.map(t => t.id));

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

  const records = eligibleTenants.map(tenant => {
    const tenantData = tenant as any;
    const baseRent = Array.isArray(tenantData.rooms)
      ? (tenantData.rooms[0]?.base_rent_paise || 0)
      : (tenantData.rooms?.base_rent_paise || 0);

    const maintenance = billingSettings.maintenance_charge_paise || 0;
    const elBill = elBillMap.get(tenant.id);
    const elAmount = elBill?.total_amount_paise || 0;
    const totalDue = baseRent + maintenance + elAmount;

    const tenantDueDate = dueDate || calculateTenantDueDate(month, tenantData.move_in_date, 1);

    const itemizedNotes = JSON.stringify({
      base_rent_paise: baseRent,
      maintenance_paise: maintenance,
      electricity_bill_id: elBill?.id || null,
      electricity_units: elBill?.units_consumed || 0,
      electricity_rate_per_unit_paise: elBill?.rate_per_unit_paise || billingSettings.electricity_rate_per_unit_paise,
      electricity_amount_paise: elAmount,
      total_due_paise: totalDue,
      pg_snapshot: pgProfileSnapshot,
      reminder_count: 0,
      last_reminder_sent_at: null,
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

export interface RentTrackingItem {
  tenant_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  room_number: string;
  room_id: string | null;
  floor: number;
  move_in_date: string | null;
  month: string;
  due_date: string;
  due_date_formatted: string;
  days_remaining: number;
  days_overdue: number;
  is_due_today: boolean;
  status: 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'PAYMENT_SUBMITTED' | 'PAID';
  status_label: string;
  base_rent_paise: number;
  maintenance_paise: number;
  electricity_units: number;
  electricity_amount_paise: number;
  late_fee_paise: number;
  total_due_paise: number;
  formatted_amount: string;
  reminder_count: number;
  last_reminder_sent_at: string | null;
  next_reminder_at: string | null;
  rent_record_id: string | null;
  payment: {
    id: string;
    amount_paise: number;
    payment_method: string;
    utr_id?: string | null;
    screenshot_path?: string | null;
    status: string;
    created_at: string;
  } | null;
}

export interface RentTrackingResponse {
  summary: {
    total_active_tenants: number;
    upcoming_count: number;
    due_today_count: number;
    overdue_count: number;
    verification_pending_count: number;
    paid_count: number;
    month: string;
  };
  data: RentTrackingItem[];
}

/**
 * Live Rent Tracking & Payment Lifecycle monitoring for all active tenants in a PG.
 * Strictly separates dynamic lifecycle tracking from static invoice generation.
 */
export async function getRentTracking(
  pgId: string,
  options?: { month?: string; upcomingWindowDays?: number }
): Promise<RentTrackingResponse> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const month = options?.month || todayStr.slice(0, 7);
  const upcomingWindow = options?.upcomingWindowDays ?? 10;

  // 1. Get billing settings for standard maintenance and rate defaults
  const billingSettings = await getBillingSettings(pgId);
  const defaultMaintenancePaise = billingSettings.maintenance_charge_paise ?? 50000;
  const defaultRatePaise = billingSettings.electricity_rate_per_unit_paise ?? 1200;

  // 2. Fetch all active tenants with room assignment
  const { data: tenants, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, full_name, phone, email, room_id, bed_id, move_in_date, status, room:rooms(id, room_number, base_rent_paise, floor)')
    .eq('pg_id', pgId)
    .eq('status', 'active');

  if (tenantErr) throw new Error(tenantErr.message);
  const activeTenants = tenants || [];

  // 3. Fetch existing rent records for this month (if generated by admin)
  const { data: rentRecords } = await supabaseAdmin
    .from('rent_records')
    .select('*')
    .eq('pg_id', pgId)
    .eq('month', month);

  const rentRecordMap = new Map<string, any>();
  if (rentRecords) {
    for (const r of rentRecords) {
      rentRecordMap.set(r.tenant_id, r);
    }
  }

  // 4. Fetch electricity bills for this month
  const { data: electricityBills } = await supabaseAdmin
    .from('electricity_bills')
    .select('*')
    .eq('pg_id', pgId)
    .eq('month', month);

  const elBillMap = new Map<string, any>();
  if (electricityBills) {
    for (const b of electricityBills) {
      elBillMap.set(b.tenant_id, b);
    }
  }

  // 5. Fetch recent payments for this PG
  const { data: payments } = await supabaseAdmin
    .from('payments')
    .select('id, tenant_id, rent_record_id, electricity_bill_id, amount_paise, payment_method, status, screenshot_path, notes, created_at, verified_at')
    .eq('pg_id', pgId)
    .order('created_at', { ascending: false });

  const tenantPaymentsMap = new Map<string, any[]>();
  if (payments) {
    for (const p of payments) {
      const list = tenantPaymentsMap.get(p.tenant_id) || [];
      list.push(p);
      tenantPaymentsMap.set(p.tenant_id, list);
    }
  }

  let upcomingCount = 0;
  let dueTodayCount = 0;
  let overdueCount = 0;
  let verificationPendingCount = 0;
  let paidCount = 0;

  const items: RentTrackingItem[] = [];

  for (const tenant of activeTenants) {
    const tenantRoom = tenant.room as any;
    const baseRentPaise = tenantRoom?.base_rent_paise || 0;

    // Calculate individual cycle due date based on tenant's move-in date
    const tenantDueDateIso = calculateTenantDueDate(month, tenant.move_in_date, 1);
    const dueDateStr = tenantDueDateIso.split('T')[0];

    // Calendar day diff: Due Date - Current Date = Days Remaining
    const dueTime = new Date(`${dueDateStr}T00:00:00Z`).getTime();
    const todayTime = new Date(`${todayStr}T00:00:00Z`).getTime();
    const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

    // Electricity bill (if any)
    const elBill = elBillMap.get(tenant.id);
    const elUnits = elBill?.units_consumed || 0;
    const elRate = elBill?.rate_per_unit_paise || defaultRatePaise;
    const elAmount = elBill?.total_amount_paise || (elUnits * elRate);

    // Existing rent record (if any)
    const existingRent = rentRecordMap.get(tenant.id);
    let parsedNotes: Record<string, any> = {};
    if (existingRent?.notes) {
      try { parsedNotes = JSON.parse(existingRent.notes); } catch {}
    }

    const maintPaise = parsedNotes.maintenance_paise ?? defaultMaintenancePaise;
    const lateFeePaise = existingRent?.late_fee_paise || 0;
    const totalDuePaise = existingRent?.total_due_paise || (baseRentPaise + maintPaise + elAmount + lateFeePaise);

    // Payment state evaluation
    const tenantPayments = tenantPaymentsMap.get(tenant.id) || [];
    const verifiedPayment = tenantPayments.find(p =>
      p.status === 'verified' && (
        (existingRent && p.rent_record_id === existingRent.id) ||
        (p.created_at && p.created_at.slice(0, 7) === month)
      )
    );

    const submittedPayment = tenantPayments.find(p =>
      p.status === 'submitted' && (
        (existingRent && p.rent_record_id === existingRent.id) ||
        (p.created_at && p.created_at.slice(0, 7) === month) ||
        !p.rent_record_id
      )
    );

    const isPaid = !!verifiedPayment || existingRent?.status === 'paid' || !!existingRent?.paid_date;

    let lifecycleStatus: 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'PAYMENT_SUBMITTED' | 'PAID' = 'UPCOMING';
    let statusLabel = '';
    let daysRemaining = 0;
    let daysOverdue = 0;
    let isDueToday = false;

    if (isPaid) {
      lifecycleStatus = 'PAID';
      statusLabel = 'Paid';
      paidCount++;
    } else if (submittedPayment) {
      lifecycleStatus = 'PAYMENT_SUBMITTED';
      statusLabel = 'Payment Verification Pending';
      verificationPendingCount++;
      if (diffDays < 0) daysOverdue = Math.abs(diffDays);
      else if (diffDays === 0) isDueToday = true;
      else daysRemaining = diffDays;
    } else if (diffDays < 0) {
      lifecycleStatus = 'OVERDUE';
      daysOverdue = Math.abs(diffDays);
      statusLabel = `${daysOverdue} days overdue`;
      overdueCount++;
    } else if (diffDays === 0) {
      lifecycleStatus = 'DUE_TODAY';
      isDueToday = true;
      statusLabel = 'Due Today';
      dueTodayCount++;
    } else {
      lifecycleStatus = 'UPCOMING';
      daysRemaining = diffDays;
      statusLabel = `Due in ${daysRemaining} days`;
      if (daysRemaining <= upcomingWindow) {
        upcomingCount++;
      }
    }

    // Reminder tracking
    const reminderCount = parsedNotes.reminder_count || 0;
    const lastReminderSentAt = parsedNotes.last_reminder_sent_at || null;
    let nextReminderAt: string | null = null;
    if (lifecycleStatus !== 'PAID' && lifecycleStatus !== 'PAYMENT_SUBMITTED') {
      if (diffDays <= 0) {
        if (lastReminderSentAt) {
          const nextDate = new Date(new Date(lastReminderSentAt).getTime() + 24 * 60 * 60 * 1000);
          nextReminderAt = nextDate.toISOString();
        } else {
          nextReminderAt = tenantDueDateIso;
        }
      } else {
        nextReminderAt = tenantDueDateIso;
      }
    }

    // Extract UTR if present
    let utrId: string | null = null;
    const activePayment = submittedPayment || verifiedPayment;
    if (activePayment?.notes) {
      const match = activePayment.notes.match(/UTR:\s*([A-Za-z0-9_-]+)/i);
      if (match) utrId = match[1];
    }

    items.push({
      tenant_id: tenant.id,
      full_name: tenant.full_name,
      phone: tenant.phone,
      email: tenant.email,
      room_number: tenantRoom?.room_number || 'Unassigned',
      room_id: tenant.room_id,
      floor: tenantRoom?.floor ?? 0,
      move_in_date: tenant.move_in_date,
      month,
      due_date: tenantDueDateIso,
      due_date_formatted: formatDateDMY(tenantDueDateIso),
      days_remaining: daysRemaining,
      days_overdue: daysOverdue,
      is_due_today: isDueToday,
      status: lifecycleStatus,
      status_label: statusLabel,
      base_rent_paise: baseRentPaise,
      maintenance_paise: maintPaise,
      electricity_units: elUnits,
      electricity_amount_paise: elAmount,
      late_fee_paise: lateFeePaise,
      total_due_paise: totalDuePaise,
      formatted_amount: (totalDuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      reminder_count: reminderCount,
      last_reminder_sent_at: lastReminderSentAt,
      next_reminder_at: nextReminderAt,
      rent_record_id: existingRent?.id || null,
      payment: activePayment ? {
        id: activePayment.id,
        amount_paise: activePayment.amount_paise,
        payment_method: activePayment.payment_method,
        utr_id: utrId,
        screenshot_path: activePayment.screenshot_path,
        status: activePayment.status,
        created_at: activePayment.created_at,
      } : null,
    });
  }

  // Sort by operational priority: Verification Pending > Due Today > Overdue > Upcoming > Paid
  items.sort((a, b) => {
    const priority: Record<string, number> = {
      PAYMENT_SUBMITTED: 1,
      DUE_TODAY: 2,
      OVERDUE: 3,
      UPCOMING: 4,
      PAID: 5,
    };
    const pA = priority[a.status] || 99;
    const pB = priority[b.status] || 99;
    if (pA !== pB) return pA - pB;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  return {
    summary: {
      total_active_tenants: activeTenants.length,
      upcoming_count: upcomingCount,
      due_today_count: dueTodayCount,
      overdue_count: overdueCount,
      verification_pending_count: verificationPendingCount,
      paid_count: paidCount,
      month,
    },
    data: items,
  };
}

/**
 * Sends a rent due reminder / bill to an individual tenant.
 * Safely anchors or creates the rent record if not yet generated,
 * dispatches the WhatsApp message, and increments the cycle reminder counter.
 */
export async function sendTenantDueReminder(pgId: string, tenantId: string, targetMonth?: string) {
  const now = new Date();
  const month = targetMonth || now.toISOString().slice(0, 7);

  // 1. Get or create rent record for this tenant and month so we have a persistent record
  let { data: record } = await supabaseAdmin
    .from('rent_records')
    .select('*')
    .eq('pg_id', pgId)
    .eq('tenant_id', tenantId)
    .eq('month', month)
    .maybeSingle();

  if (!record) {
    const created = await generateRentRecords(pgId, month, [tenantId]);
    if (created && created.length > 0) {
      record = created[0];
    } else {
      throw new Error('Could not initialize rent record for tenant');
    }
  }

  // 2. Dispatch bill / reminder via WhatsApp
  const result = await sendRentBillWhatsApp(pgId, record.id);

  // 3. Increment reminder counter in notes
  let parsedNotes: any = {};
  if (record.notes) {
    try { parsedNotes = JSON.parse(record.notes); } catch {}
  }
  const currentCount = typeof parsedNotes.reminder_count === 'number' ? parsedNotes.reminder_count : 0;
  const newCount = currentCount + 1;
  const nowIso = new Date().toISOString();

  await supabaseAdmin
    .from('rent_records')
    .update({
      notes: JSON.stringify({
        ...parsedNotes,
        reminder_count: newCount,
        last_reminder_sent_at: nowIso,
      }),
      updated_at: nowIso,
    })
    .eq('id', record.id);

  return { ...result, reminder_count: newCount, last_reminder_sent_at: nowIso };
}

