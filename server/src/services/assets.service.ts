import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';

export async function listAllAssets(
  pgId: string,
  filters?: { roomId?: string; condition?: string }
) {
  let query = supabaseAdmin
    .from('assets')
    .select('*, room:rooms!inner(id, room_number, floor)')
    .eq('pg_id', pgId)
    .order('created_at', { ascending: false });

  if (filters?.roomId) {
    query = query.eq('room_id', filters.roomId);
  }
  if (filters?.condition) {
    query = query.eq('condition', filters.condition);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function listAssets(roomId: string) {
  const { data, error } = await supabaseAdmin
    .from('assets')
    .select('*')
    .eq('room_id', roomId)
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

export async function createAsset(
  pgId: string,
  assetData: {
    room_id: string;
    name: string;
    description?: string | null;
    quantity?: number;
    condition?: string;
    notes?: string | null;
  },
  actor: { id: string; email: string }
) {
  const { data, error } = await supabaseAdmin
    .from('assets')
    .insert({
      pg_id: pgId,
      room_id: assetData.room_id,
      name: assetData.name,
      description: assetData.description || null,
      quantity: assetData.quantity || 1,
      condition: assetData.condition || 'good',
      notes: assetData.notes || null,
    })
    .select('*, room:rooms(id, room_number, floor)')
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'CREATE_ASSET',
    entityType: 'asset',
    entityId: data.id,
    details: { room_id: assetData.room_id, name: assetData.name },
  });

  return data;
}

export async function updateAsset(
  pgId: string,
  id: string,
  updates: Record<string, unknown>,
  actor: { id: string; email: string }
) {
  const { data, error } = await supabaseAdmin
    .from('assets')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('pg_id', pgId)
    .select('*, room:rooms(id, room_number, floor)')
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_ASSET',
    entityType: 'asset',
    entityId: id,
    details: updates,
  });

  return data;
}

export async function deleteAsset(
  pgId: string,
  id: string,
  actor: { id: string; email: string }
) {
  const { error } = await supabaseAdmin
    .from('assets')
    .delete()
    .eq('id', id)
    .eq('pg_id', pgId);

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'DELETE_ASSET',
    entityType: 'asset',
    entityId: id,
  });
}
