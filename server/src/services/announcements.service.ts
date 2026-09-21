import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';
import { Announcement } from '../types';

export async function listAnnouncements(pgId: string, status = 'active'): Promise<Announcement[]> {
  let query = supabaseAdmin
    .from('announcements')
    .select('*')
    .eq('pg_id', pgId);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function createAnnouncement(
  pgId: string,
  announcementData: {
    title: string;
    description: string;
    category?: 'water' | 'electricity' | 'maintenance' | 'rent' | 'general';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    expires_at?: string | null;
  },
  actor: { id: string; email: string }
): Promise<Announcement> {
  const { data, error } = await supabaseAdmin
    .from('announcements')
    .insert({
      pg_id: pgId,
      title: announcementData.title,
      description: announcementData.description,
      category: announcementData.category || 'general',
      priority: announcementData.priority || 'medium',
      expires_at: announcementData.expires_at || null,
      status: 'active',
      created_by: actor.id,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'CREATE_ANNOUNCEMENT',
    entityType: 'announcement',
    entityId: data.id,
    details: { title: data.title, priority: data.priority },
  });

  return data;
}

export async function updateAnnouncement(
  pgId: string,
  id: string,
  updates: Record<string, unknown>,
  actor: { id: string; email: string }
): Promise<Announcement> {
  const { data, error } = await supabaseAdmin
    .from('announcements')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('pg_id', pgId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_ANNOUNCEMENT',
    entityType: 'announcement',
    entityId: id,
    details: updates,
  });

  return data;
}

export async function deleteAnnouncement(
  pgId: string,
  id: string,
  actor: { id: string; email: string }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('pg_id', pgId);

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'DELETE_ANNOUNCEMENT',
    entityType: 'announcement',
    entityId: id,
  });
}
