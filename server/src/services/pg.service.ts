import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';
import { PG } from '../types';

export async function getPG(pgId: string): Promise<PG> {
  const { data, error } = await supabaseAdmin
    .from('pgs')
    .select('*')
    .eq('id', pgId)
    .single();

  if (error || !data) {
    throw new Error('PG not found');
  }

  return data;
}

export async function updatePG(
  pgId: string,
  updates: Record<string, unknown>,
  actor: { id: string; email: string }
): Promise<PG> {
  const { data, error } = await supabaseAdmin
    .from('pgs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pgId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_PG_SETTINGS',
    entityType: 'pg',
    entityId: pgId,
    details: updates,
  });

  return data;
}
