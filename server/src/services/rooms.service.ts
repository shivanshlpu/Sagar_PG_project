import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';

export async function listRooms(pgId: string) {
  const { data, error } = await supabaseAdmin
    .from('rooms')
    .select('*, beds(*)')
    .eq('pg_id', pgId)
    .order('room_number');

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getRoom(pgId: string, id: string) {
  const { data, error } = await supabaseAdmin
    .from('rooms')
    .select('*, beds(*)')
    .eq('id', id)
    .eq('pg_id', pgId)
    .single();

  if (error || !data) throw new Error('Room not found');
  return data;
}

export async function createRoom(
  pgId: string,
  roomData: {
    room_number: string;
    floor: number;
    room_type: string;
    total_beds: number;
    base_rent_paise: number;
    notes?: string | null;
  },
  actor: { id: string; email: string }
) {
  const { data, error } = await supabaseAdmin
    .from('rooms')
    .insert({
      ...roomData,
      pg_id: pgId,
      occupied_beds: 0,
      status: 'available',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Auto-create beds for the room with pg_id
  const beds = Array.from({ length: roomData.total_beds }, (_, i) => ({
    pg_id: pgId,
    room_id: data.id,
    bed_number: `${roomData.room_number}-B${i + 1}`,
    status: 'vacant',
  }));

  const { error: bedError } = await supabaseAdmin.from('beds').insert(beds);
  if (bedError) throw new Error(bedError.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'CREATE_ROOM',
    entityType: 'room',
    entityId: data.id,
    details: { room_number: roomData.room_number },
  });

  return getRoom(pgId, data.id);
}

export async function updateRoom(
  pgId: string,
  id: string,
  updates: Record<string, unknown>,
  actor: { id: string; email: string }
) {
  const { data, error } = await supabaseAdmin
    .from('rooms')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('pg_id', pgId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_ROOM',
    entityType: 'room',
    entityId: id,
    details: updates,
  });

  return data;
}

export async function deleteRoom(pgId: string, id: string, actor: { id: string; email: string }) {
  // Check if room has occupied beds
  const { data: beds } = await supabaseAdmin
    .from('beds')
    .select('id')
    .eq('room_id', id)
    .eq('pg_id', pgId)
    .eq('status', 'occupied');

  if (beds && beds.length > 0) {
    throw new Error('Cannot delete room with occupied beds. Move out all tenants first.');
  }

  // Delete beds first
  await supabaseAdmin.from('beds').delete().eq('room_id', id).eq('pg_id', pgId);

  const { error } = await supabaseAdmin
    .from('rooms')
    .delete()
    .eq('id', id)
    .eq('pg_id', pgId);

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'DELETE_ROOM',
    entityType: 'room',
    entityId: id,
  });
}

export async function getRoomBeds(pgId: string, roomId: string) {
  // Verify room belongs to this PG
  await getRoom(pgId, roomId);

  const { data, error } = await supabaseAdmin
    .from('beds')
    .select('*, tenant:tenants(id, full_name, phone)')
    .eq('room_id', roomId)
    .eq('pg_id', pgId)
    .order('bed_number');

  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateBed(
  pgId: string,
  roomId: string,
  bedId: string,
  updates: { tenant_id?: string | null; status?: string },
  actor: { id: string; email: string }
) {
  // Verify room belongs to this PG
  await getRoom(pgId, roomId);

  // If assigning a bed to a tenant, ensure concurrency safety (must be vacant)
  if (updates.status === 'occupied') {
    const { data: bedRecord } = await supabaseAdmin
      .from('beds')
      .select('status, tenant_id')
      .eq('id', bedId)
      .eq('room_id', roomId)
      .eq('pg_id', pgId)
      .single();

    if (bedRecord && bedRecord.status === 'occupied' && bedRecord.tenant_id !== updates.tenant_id) {
      throw new Error('Bed is already occupied by another tenant');
    }
  }

  const { data, error } = await supabaseAdmin
    .from('beds')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', bedId)
    .eq('room_id', roomId)
    .eq('pg_id', pgId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Update room occupied_beds count
  const { data: occupiedBeds } = await supabaseAdmin
    .from('beds')
    .select('id')
    .eq('room_id', roomId)
    .eq('pg_id', pgId)
    .eq('status', 'occupied');

  const occupiedCount = occupiedBeds?.length || 0;
  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('total_beds')
    .eq('id', roomId)
    .eq('pg_id', pgId)
    .single();

  await supabaseAdmin
    .from('rooms')
    .update({
      occupied_beds: occupiedCount,
      status: occupiedCount >= (room?.total_beds || 0) ? 'full' : 'available',
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId)
    .eq('pg_id', pgId);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_BED',
    entityType: 'bed',
    entityId: bedId,
    details: updates,
  });

  return data;
}
