import { supabaseAdmin } from '../config/supabase';

export async function listNotifications(userId: string, filters?: { unreadOnly?: boolean; pgId?: string }) {
  let query = supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', userId);

  if (filters?.pgId) {
    query = query.eq('pg_id', filters.pgId);
  }

  if (filters?.unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return data;
}

export async function markAsRead(id: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('user_id', userId) // Scoped to user for security
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createNotification(params: {
  userId: string;
  pgId?: string;
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id: params.userId,
      pg_id: params.pgId || null,
      title: params.title,
      message: params.message,
      type: params.type,
      is_read: false,
      metadata: params.metadata || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getUnreadCount(userId: string) {
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw new Error(error.message);
  return count || 0;
}
