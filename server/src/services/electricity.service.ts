import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';
import { getBillingSettings } from './settings.service';
import { generateRentRecords } from './rent.service';

export async function listElectricityBills(
  pgId: string,
  filters?: {
    month?: string;
    room_id?: string;
    tenant_id?: string;
    status?: string;
  }
) {
  let query = supabaseAdmin
    .from('electricity_bills')
    .select('*, tenant:tenants(full_name, phone), room:rooms(room_number)')
    .eq('pg_id', pgId);

  if (filters?.month) query = query.eq('month', filters.month);
  if (filters?.room_id) query = query.eq('room_id', filters.room_id);
  if (filters?.tenant_id) query = query.eq('tenant_id', filters.tenant_id);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getElectricityBill(pgId: string, id: string) {
  const { data, error } = await supabaseAdmin
    .from('electricity_bills')
    .select('*, tenant:tenants(full_name, phone), room:rooms(room_number)')
    .eq('id', id)
    .eq('pg_id', pgId)
    .single();

  if (error || !data) throw new Error('Electricity bill not found');
  return data;
}

export async function getLatestElectricityReading(
  pgId: string,
  roomId?: string,
  tenantId?: string
) {
  let query = supabaseAdmin
    .from('electricity_bills')
    .select('current_reading, month')
    .eq('pg_id', pgId);

  if (roomId) query = query.eq('room_id', roomId);
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error } = await query
    .order('month', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);

  if (data && data.length > 0) {
    return {
      previous_reading: data[0].current_reading,
      last_month: data[0].month,
    };
  }

  return {
    previous_reading: 0,
    last_month: null,
  };
}

export async function createElectricityBill(
  pgId: string,
  billData: {
    tenant_id: string;
    room_id: string;
    month: string;
    previous_reading: number;
    current_reading: number;
    rate_per_unit_paise?: number;
    notes?: string | null;
  },
  actor: { id: string; email: string }
) {
  // Validate tenant and room belong to this PG
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', billData.tenant_id)
    .eq('pg_id', pgId)
    .single();

  if (!tenant) throw new Error('Tenant not found in your PG');

  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('id, base_rent_paise')
    .eq('id', billData.room_id)
    .eq('pg_id', pgId)
    .single();

  if (!room) throw new Error('Room not found in your PG');

  // If rate not provided, fetch default from billing settings
  let ratePerUnitPaise = billData.rate_per_unit_paise;
  const billingSettings = await getBillingSettings(pgId);
  if (!ratePerUnitPaise || ratePerUnitPaise <= 0) {
    ratePerUnitPaise = billingSettings.electricity_rate_per_unit_paise;
  }

  const unitsConsumed = Math.max(0, billData.current_reading - billData.previous_reading);
  const totalAmountPaise = unitsConsumed * ratePerUnitPaise;

  const { data, error } = await supabaseAdmin
    .from('electricity_bills')
    .insert({
      ...billData,
      pg_id: pgId,
      rate_per_unit_paise: ratePerUnitPaise,
      units_consumed: unitsConsumed,
      total_amount_paise: totalAmountPaise,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Synchronize with rent record for this tenant and month if it exists
  try {
    const { data: rentRecord } = await supabaseAdmin
      .from('rent_records')
      .select('*')
      .eq('pg_id', pgId)
      .eq('tenant_id', billData.tenant_id)
      .eq('month', billData.month)
      .maybeSingle();

    if (rentRecord) {
      let notesObj: Record<string, any> = {};
      if (rentRecord.notes) {
        try {
          notesObj = JSON.parse(rentRecord.notes);
        } catch {
          notesObj = { note: rentRecord.notes };
        }
      }

      const baseRent = rentRecord.rent_amount_paise || room.base_rent_paise || 0;
      const maintenance = notesObj.maintenance_paise !== undefined
        ? notesObj.maintenance_paise
        : billingSettings.maintenance_charge_paise;
      const lateFee = rentRecord.late_fee_paise || 0;
      const newTotalDue = baseRent + maintenance + totalAmountPaise + lateFee;

      const updatedNotes = JSON.stringify({
        ...notesObj,
        base_rent_paise: baseRent,
        maintenance_paise: maintenance,
        electricity_bill_id: data.id,
        electricity_units: unitsConsumed,
        electricity_rate_per_unit_paise: ratePerUnitPaise,
        electricity_amount_paise: totalAmountPaise,
        total_due_paise: newTotalDue,
      });

      await supabaseAdmin
        .from('rent_records')
        .update({
          notes: updatedNotes,
          total_due_paise: newTotalDue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rentRecord.id)
        .eq('pg_id', pgId);
    } else {
      try {
        await generateRentRecords(pgId, billData.month, [billData.tenant_id]);
      } catch (genErr) {
        console.warn('[Electricity] Notice auto-generating rent record on bill creation:', genErr);
      }
    }
  } catch (syncErr) {
    console.error('Failed to sync electricity bill with rent record:', syncErr);
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'CREATE_ELECTRICITY_BILL',
    entityType: 'electricity_bill',
    entityId: data.id,
    details: { tenant_id: billData.tenant_id, units: unitsConsumed, amount_paise: totalAmountPaise },
  });

  return data;
}

export async function updateElectricityBill(
  pgId: string,
  id: string,
  updates: {
    month?: string;
    previous_reading?: number;
    current_reading?: number;
    rate_per_unit_paise?: number;
    total_amount_paise?: number;
    status?: string;
    notes?: string | null;
  },
  actor: { id: string; email: string }
) {
  // 1. Verify bill exists in PG
  const existingBill = await getElectricityBill(pgId, id);

  // 2. Immutability Check: Prevent accidental editing of completed financial records!
  if (existingBill.status === 'paid' && updates.status !== 'pending') {
    throw new Error('Completed financial records are locked. A paid electricity bill cannot be modified.');
  }

  // 3. Compute recalculated readings and amounts if readings or rate are updated
  const prevReading = updates.previous_reading !== undefined ? Number(updates.previous_reading) : Number(existingBill.previous_reading);
  const currReading = updates.current_reading !== undefined ? Number(updates.current_reading) : Number(existingBill.current_reading);

  if (currReading < prevReading) {
    throw new Error('Current reading must be greater than or equal to previous reading');
  }

  const unitsConsumed = Math.max(0, currReading - prevReading);
  const ratePerUnitPaise = updates.rate_per_unit_paise !== undefined
    ? Number(updates.rate_per_unit_paise)
    : Number(existingBill.rate_per_unit_paise || 1200);
  const totalAmountPaise = updates.total_amount_paise !== undefined
    ? Number(updates.total_amount_paise)
    : Math.round(unitsConsumed * ratePerUnitPaise);

  const finalUpdates: Record<string, any> = {
    ...updates,
    previous_reading: prevReading,
    current_reading: currReading,
    units_consumed: unitsConsumed,
    rate_per_unit_paise: ratePerUnitPaise,
    total_amount_paise: totalAmountPaise,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('electricity_bills')
    .update(finalUpdates)
    .eq('id', id)
    .eq('pg_id', pgId)
    .select('*, tenant:tenants(full_name, phone), room:rooms(room_number)')
    .single();

  if (error) throw new Error(error.message);

  // 4. Synchronize with rent record for this tenant and month if one exists
  try {
    const targetMonth = updates.month || existingBill.month;
    const { data: rentRecord } = await supabaseAdmin
      .from('rent_records')
      .select('*')
      .eq('pg_id', pgId)
      .eq('tenant_id', existingBill.tenant_id)
      .eq('month', targetMonth)
      .maybeSingle();

    if (rentRecord) {
      let notesObj: Record<string, any> = {};
      if (rentRecord.notes) {
        try {
          notesObj = JSON.parse(rentRecord.notes);
        } catch {
          notesObj = { note: rentRecord.notes };
        }
      }

      const baseRent = rentRecord.rent_amount_paise || 0;
      const maintenance = notesObj.maintenance_paise !== undefined ? notesObj.maintenance_paise : 50000;
      const lateFee = rentRecord.late_fee_paise || 0;
      const newTotalDue = baseRent + maintenance + totalAmountPaise + lateFee;

      const updatedNotes = JSON.stringify({
        ...notesObj,
        base_rent_paise: baseRent,
        maintenance_paise: maintenance,
        electricity_bill_id: data.id,
        electricity_units: unitsConsumed,
        electricity_rate_per_unit_paise: ratePerUnitPaise,
        electricity_amount_paise: totalAmountPaise,
        total_due_paise: newTotalDue,
      });

      await supabaseAdmin
        .from('rent_records')
        .update({
          notes: updatedNotes,
          total_due_paise: newTotalDue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rentRecord.id)
        .eq('pg_id', pgId);
    } else {
      try {
        await generateRentRecords(pgId, targetMonth, [existingBill.tenant_id]);
      } catch (genErr) {
        console.warn('[Electricity] Notice auto-generating rent record on bill update:', genErr);
      }
    }
  } catch (syncErr) {
    console.error('Failed to sync updated electricity bill with rent record:', syncErr);
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_ELECTRICITY_BILL',
    entityType: 'electricity_bill',
    entityId: id,
    details: { units_consumed: unitsConsumed, total_amount_paise: totalAmountPaise, ...updates },
  });

  return data;
}

