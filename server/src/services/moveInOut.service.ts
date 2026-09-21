import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';

export async function moveIn(
  pgId: string,
  tenantId: string,
  data: { room_id: string; bed_id: string; move_in_date: string; security_deposit_paise?: number; notes?: string | null },
  actor: { id: string; email: string }
) {
  // Verify tenant belongs to PG
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .eq('pg_id', pgId)
    .single();

  if (!tenant) throw new Error('Tenant not found in your PG');

  // Verify bed belongs to PG and is vacant
  const { data: bed } = await supabaseAdmin
    .from('beds')
    .select('id, status')
    .eq('id', data.bed_id)
    .eq('room_id', data.room_id)
    .eq('pg_id', pgId)
    .single();

  if (!bed) throw new Error('Selected bed does not exist in this room');
  if (bed.status === 'occupied') throw new Error('Selected bed is already occupied');

  // Update tenant record
  const { error: tenantError } = await supabaseAdmin
    .from('tenants')
    .update({
      room_id: data.room_id,
      bed_id: data.bed_id,
      move_in_date: data.move_in_date,
      security_deposit_paise: data.security_deposit_paise || 0,
      status: 'active',
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId)
    .eq('pg_id', pgId);

  if (tenantError) throw new Error(tenantError.message);

  // Update bed status
  const { error: bedError } = await supabaseAdmin
    .from('beds')
    .update({ tenant_id: tenantId, status: 'occupied', updated_at: new Date().toISOString() })
    .eq('id', data.bed_id)
    .eq('pg_id', pgId);

  if (bedError) throw new Error(bedError.message);

  // Update room occupancy
  const { data: occupiedBeds } = await supabaseAdmin
    .from('beds')
    .select('id')
    .eq('room_id', data.room_id)
    .eq('pg_id', pgId)
    .eq('status', 'occupied');

  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('total_beds')
    .eq('id', data.room_id)
    .eq('pg_id', pgId)
    .single();

  const count = occupiedBeds?.length || 0;
  await supabaseAdmin
    .from('rooms')
    .update({
      occupied_beds: count,
      status: count >= (room?.total_beds || 0) ? 'full' : 'available',
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.room_id)
    .eq('pg_id', pgId);

  // Create notification
  await supabaseAdmin.from('notifications').insert({
    user_id: tenantId,
    title: 'Welcome! Move-In Confirmed',
    message: `Your move-in has been confirmed. Welcome to your new room.`,
    type: 'move_in',
    is_read: false,
  });

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'MOVE_IN',
    entityType: 'tenant',
    entityId: tenantId,
    details: { room_id: data.room_id, bed_id: data.bed_id },
  });
}

export async function moveOut(
  pgId: string,
  tenantId: string,
  data: { move_out_date: string; notes?: string | null },
  actor: { id: string; email: string }
) {
  // Get tenant's current room/bed
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('room_id, bed_id')
    .eq('id', tenantId)
    .eq('pg_id', pgId)
    .single();

  if (!tenant) throw new Error('Tenant not found in your PG');

  // Update tenant
  await supabaseAdmin
    .from('tenants')
    .update({
      move_out_date: data.move_out_date,
      status: 'moved_out',
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId)
    .eq('pg_id', pgId);

  // Vacate bed
  if (tenant.bed_id) {
    await supabaseAdmin
      .from('beds')
      .update({ tenant_id: null, status: 'vacant', updated_at: new Date().toISOString() })
      .eq('id', tenant.bed_id)
      .eq('pg_id', pgId);
  }

  // Update room occupancy
  if (tenant.room_id) {
    const { data: occupiedBeds } = await supabaseAdmin
      .from('beds')
      .select('id')
      .eq('room_id', tenant.room_id)
      .eq('pg_id', pgId)
      .eq('status', 'occupied');

    await supabaseAdmin
      .from('rooms')
      .update({
        occupied_beds: occupiedBeds?.length || 0,
        status: 'available',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.room_id)
      .eq('pg_id', pgId);
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'MOVE_OUT',
    entityType: 'tenant',
    entityId: tenantId,
    details: { room_id: tenant.room_id, bed_id: tenant.bed_id },
  });
}

export async function getMoveOutSummary(pgId: string, tenantId: string) {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('*, room:rooms(room_number)')
    .eq('id', tenantId)
    .eq('pg_id', pgId)
    .single();

  if (!tenant) throw new Error('Tenant not found in your PG');

  // Get pending rent
  const { data: pendingRent } = await supabaseAdmin
    .from('rent_records')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('pg_id', pgId)
    .in('status', ['pending', 'overdue', 'partially_paid']);

  // Get pending electricity
  const { data: pendingElectricity } = await supabaseAdmin
    .from('electricity_bills')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('pg_id', pgId)
    .eq('status', 'pending');

  const totalPendingRent = pendingRent?.reduce((sum, r) => sum + r.total_due_paise, 0) || 0;
  const totalPendingElectricity = pendingElectricity?.reduce((sum, b) => sum + b.total_amount_paise, 0) || 0;
  const securityDeposit = tenant?.security_deposit_paise || 0;

  return {
    tenant,
    pendingRent: pendingRent || [],
    pendingElectricity: pendingElectricity || [],
    summary: {
      total_pending_rent_paise: totalPendingRent,
      total_pending_electricity_paise: totalPendingElectricity,
      security_deposit_paise: securityDeposit,
      net_settlement_paise: securityDeposit - totalPendingRent - totalPendingElectricity,
    },
  };
}

