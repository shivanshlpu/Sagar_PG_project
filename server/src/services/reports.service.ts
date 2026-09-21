import { supabaseAdmin } from '../config/supabase';

export async function getRentReport(pgId: string, filters?: { range?: string; roomId?: string; tenantId?: string }) {
  let query = supabaseAdmin
    .from('rent_records')
    .select('*, tenant:tenants(full_name), room:rooms(room_number)')
    .eq('pg_id', pgId);

  if (filters?.roomId) query = query.eq('room_id', filters.roomId);
  if (filters?.tenantId) query = query.eq('tenant_id', filters.tenantId);

  if (filters?.range) {
    const [start, end] = filters.range.split(':');
    if (start) query = query.gte('month', start);
    if (end) query = query.lte('month', end);
  }

  const { data, error } = await query.order('month', { ascending: false });
  if (error) throw new Error(error.message);

  // Aggregate
  const totalDue = data?.reduce((sum, r) => sum + r.total_due_paise, 0) || 0;
  const totalCollected = data?.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.total_due_paise, 0) || 0;
  const totalPending = data?.filter(r => ['pending', 'overdue'].includes(r.status)).reduce((sum, r) => sum + r.total_due_paise, 0) || 0;

  return {
    records: data || [],
    summary: {
      total_due_paise: totalDue,
      total_collected_paise: totalCollected,
      total_pending_paise: totalPending,
      collection_rate: totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0,
    },
  };
}

export async function getElectricityReport(pgId: string, filters?: { range?: string; roomId?: string }) {
  let query = supabaseAdmin
    .from('electricity_bills')
    .select('*, tenant:tenants(full_name), room:rooms(room_number)')
    .eq('pg_id', pgId);

  if (filters?.roomId) query = query.eq('room_id', filters.roomId);

  if (filters?.range) {
    const [start, end] = filters.range.split(':');
    if (start) query = query.gte('month', start);
    if (end) query = query.lte('month', end);
  }

  const { data, error } = await query.order('month', { ascending: false });
  if (error) throw new Error(error.message);

  const totalBilled = data?.reduce((sum, b) => sum + b.total_amount_paise, 0) || 0;
  const totalUnits = data?.reduce((sum, b) => sum + b.units_consumed, 0) || 0;
  const totalCollected = data?.filter(b => b.status === 'paid').reduce((sum, b) => sum + b.total_amount_paise, 0) || 0;

  return {
    bills: data || [],
    summary: {
      total_billed_paise: totalBilled,
      total_collected_paise: totalCollected,
      total_units_consumed: totalUnits,
    },
  };
}

export async function getRevenueReport(pgId: string, filters?: { range?: string }) {
  const rentReport = await getRentReport(pgId, { range: filters?.range });
  const electricityReport = await getElectricityReport(pgId, { range: filters?.range });

  return {
    rent: rentReport.summary,
    electricity: electricityReport.summary,
    total_revenue_paise: rentReport.summary.total_collected_paise + electricityReport.summary.total_collected_paise,
    total_pending_paise: rentReport.summary.total_pending_paise + (electricityReport.summary.total_billed_paise - electricityReport.summary.total_collected_paise),
  };
}

export async function getAuditLog(pgId: string, filters?: { actor?: string; action?: string; range?: string; page?: number; limit?: number }) {
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('pg_id', pgId);

  if (filters?.actor) query = query.eq('actor_id', filters.actor);
  if (filters?.action) query = query.eq('action', filters.action);

  if (filters?.range) {
    const [start, end] = filters.range.split(':');
    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', end);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0, page, limit };
}

export async function getMonthlyBillingSummary(pgId: string, month: string) {
  // 1. Fetch rent records for this month
  const { data: rentRecords, error: rentError } = await supabaseAdmin
    .from('rent_records')
    .select('*, tenant:tenants(id, full_name, phone), room:rooms(room_number, base_rent_paise)')
    .eq('pg_id', pgId)
    .eq('month', month)
    .order('created_at', { ascending: true });

  if (rentError) throw new Error(rentError.message);

  // 2. Fetch electricity bills for this month
  const { data: electricityBills, error: elError } = await supabaseAdmin
    .from('electricity_bills')
    .select('*')
    .eq('pg_id', pgId)
    .eq('month', month);

  if (elError) throw new Error(elError.message);

  const elMap = new Map<string, any>();
  if (electricityBills) {
    for (const b of electricityBills) {
      elMap.set(b.tenant_id, b);
    }
  }

  // 3. Map rows
  const rows = (rentRecords || []).map((rec: any) => {
    let parsedNotes: Record<string, any> = {};
    if (rec.notes) {
      try {
        parsedNotes = JSON.parse(rec.notes);
      } catch {
        // raw string note
      }
    }

    const elBill = elMap.get(rec.tenant_id);
    const baseRent = parsedNotes.base_rent_paise ?? (rec.rent_amount_paise || rec.room?.base_rent_paise || 0);
    const maintenance = parsedNotes.maintenance_paise ?? 50000;
    const elUnits = elBill?.units_consumed ?? parsedNotes.electricity_units ?? 0;
    const elRate = elBill?.rate_per_unit_paise ?? parsedNotes.electricity_rate_per_unit_paise ?? 1200;
    const elAmount = elBill?.total_amount_paise ?? parsedNotes.electricity_amount_paise ?? (elUnits * elRate);
    const lateFee = rec.late_fee_paise || 0;
    const totalDue = parsedNotes.total_due_paise ?? rec.total_due_paise ?? (baseRent + maintenance + elAmount + lateFee);

    return {
      id: rec.id,
      tenant_id: rec.tenant_id,
      tenant_name: rec.tenant?.full_name || 'Unknown',
      phone: rec.tenant?.phone || '',
      room_number: rec.room?.room_number || 'Unassigned',
      base_rent_paise: baseRent,
      maintenance_paise: maintenance,
      electricity_prev_reading: elBill?.previous_reading ?? null,
      electricity_curr_reading: elBill?.current_reading ?? null,
      electricity_units: elUnits,
      electricity_rate_per_unit_paise: elRate,
      electricity_amount_paise: elAmount,
      late_fee_paise: lateFee,
      total_due_paise: totalDue,
      status: rec.status,
      due_date: rec.due_date,
      paid_date: rec.paid_date,
    };
  });

  // Calculate totals
  const totalBaseRent = rows.reduce((s, r) => s + r.base_rent_paise, 0);
  const totalMaintenance = rows.reduce((s, r) => s + r.maintenance_paise, 0);
  const totalUnits = rows.reduce((s, r) => s + r.electricity_units, 0);
  const totalElectricity = rows.reduce((s, r) => s + r.electricity_amount_paise, 0);
  const totalLateFee = rows.reduce((s, r) => s + r.late_fee_paise, 0);
  const totalDue = rows.reduce((s, r) => s + r.total_due_paise, 0);
  const totalCollected = rows.filter(r => r.status === 'paid').reduce((s, r) => s + r.total_due_paise, 0);
  const totalPending = rows.filter(r => ['pending', 'overdue'].includes(r.status)).reduce((s, r) => s + r.total_due_paise, 0);

  return {
    month,
    rows,
    summary: {
      total_tenants: rows.length,
      total_base_rent_paise: totalBaseRent,
      total_maintenance_paise: totalMaintenance,
      total_units_consumed: totalUnits,
      total_electricity_paise: totalElectricity,
      total_late_fee_paise: totalLateFee,
      total_due_paise: totalDue,
      total_collected_paise: totalCollected,
      total_pending_paise: totalPending,
      collection_rate: totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0,
    },
  };
}

export async function exportMonthlyBillingCsv(pgId: string, month: string): Promise<string> {
  const data = await getMonthlyBillingSummary(pgId, month);

  // Helper to escape CSV cell
  const escapeCsv = (str: any) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const toRupees = (paise: number) => (paise / 100).toFixed(2);

  const lines: string[] = [];

  // Header information
  lines.push(`Monthly Billing & Collection Report - Month: ${month}`);
  lines.push(`Generated: ${new Date().toLocaleString('en-IN')}`);
  lines.push('');

  // Column headers
  lines.push([
    'Tenant Name',
    'Phone',
    'Room Number',
    'Base Rent (Rs.)',
    'Maintenance Charge (Rs.)',
    'Electricity Prev Reading',
    'Electricity Curr Reading',
    'Units Consumed',
    'Rate/Unit (Rs.)',
    'Electricity Bill (Rs.)',
    'Late Fee (Rs.)',
    'Total Due (Rs.)',
    'Status',
    'Paid Date',
  ].map(escapeCsv).join(','));

  // Data rows
  for (const r of data.rows) {
    lines.push([
      r.tenant_name,
      r.phone,
      r.room_number,
      toRupees(r.base_rent_paise),
      toRupees(r.maintenance_paise),
      r.electricity_prev_reading !== null ? r.electricity_prev_reading : '-',
      r.electricity_curr_reading !== null ? r.electricity_curr_reading : '-',
      r.electricity_units,
      toRupees(r.electricity_rate_per_unit_paise),
      toRupees(r.electricity_amount_paise),
      toRupees(r.late_fee_paise),
      toRupees(r.total_due_paise),
      r.status.toUpperCase(),
      r.paid_date ? new Date(r.paid_date).toLocaleDateString('en-IN') : '-',
    ].map(escapeCsv).join(','));
  }

  // Summary row
  lines.push('');
  lines.push([
    'TOTALS',
    '',
    `${data.summary.total_tenants} Tenants`,
    toRupees(data.summary.total_base_rent_paise),
    toRupees(data.summary.total_maintenance_paise),
    '',
    '',
    data.summary.total_units_consumed,
    '',
    toRupees(data.summary.total_electricity_paise),
    toRupees(data.summary.total_late_fee_paise),
    toRupees(data.summary.total_due_paise),
    `Collected: Rs. ${toRupees(data.summary.total_collected_paise)} | Pending: Rs. ${toRupees(data.summary.total_pending_paise)}`,
    '',
  ].map(escapeCsv).join(','));

  // Prepend UTF-8 BOM for Microsoft Excel compatibility
  return '\uFEFF' + lines.join('\r\n');
}

