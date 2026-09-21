import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';

export async function listComplaints(
  pgId: string,
  filters?: {
    status?: string;
    category?: string;
    tenant_id?: string;
    priority?: string;
  }
) {
  let query = supabaseAdmin
    .from('complaints')
    .select('*, tenant:tenants(full_name, phone, room_id), room:rooms(room_number)')
    .eq('pg_id', pgId);

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.tenant_id) query = query.eq('tenant_id', filters.tenant_id);
  if (filters?.priority) query = query.eq('priority', filters.priority);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getComplaint(pgId: string, id: string, tenantId?: string) {
  let query = supabaseAdmin
    .from('complaints')
    .select('*, tenant:tenants(full_name, phone, email), room:rooms(room_number), comments:complaint_comments(*, author_email:author_id)')
    .eq('id', id)
    .eq('pg_id', pgId);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query.single();
  if (error || !data) throw new Error('Complaint not found');
  return data;
}

export async function createComplaint(
  pgId: string,
  tenantId: string,
  complaintData: {
    room_id?: string | null;
    category: string;
    title: string;
    description: string;
    priority?: string;
  }
) {
  // Get tenant's room if not specified
  let roomId = complaintData.room_id;
  if (!roomId) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('room_id')
      .eq('id', tenantId)
      .eq('pg_id', pgId)
      .single();
    roomId = tenant?.room_id || null;
  }

  const { data, error } = await supabaseAdmin
    .from('complaints')
    .insert({
      pg_id: pgId,
      tenant_id: tenantId,
      room_id: roomId,
      category: complaintData.category,
      title: complaintData.title,
      description: complaintData.description,
      priority: complaintData.priority || 'medium',
      status: 'open',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateComplaint(
  pgId: string,
  id: string,
  updates: {
    status?: string;
    assigned_to?: string | null;
    resolution_note?: string | null;
    priority?: string;
  },
  actor: { id: string; email: string }
) {
  // Verify complaint exists in PG
  await getComplaint(pgId, id);

  const updateData: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.status === 'resolved') {
    updateData.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('complaints')
    .update(updateData)
    .eq('id', id)
    .eq('pg_id', pgId)
    .select('*, tenant:tenants(id, full_name)')
    .single();

  if (error) throw new Error(error.message);

  // Notify tenant of status change
  if (updates.status) {
    await supabaseAdmin.from('notifications').insert({
      user_id: data.tenant_id,
      title: 'Complaint Updated',
      message: `Your complaint "${data.title}" has been updated to: ${updates.status}`,
      type: 'complaint_update',
      is_read: false,
      metadata: { complaint_id: id, new_status: updates.status },
    });
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_COMPLAINT',
    entityType: 'complaint',
    entityId: id,
    details: updates,
  });

  return data;
}

export async function addComment(
  pgId: string,
  complaintId: string,
  authorId: string,
  authorRole: 'admin' | 'tenant',
  content: string
) {
  // Ensure complaint belongs to PG
  await getComplaint(pgId, complaintId);

  const { data, error } = await supabaseAdmin
    .from('complaint_comments')
    .insert({
      complaint_id: complaintId,
      author_id: authorId,
      author_role: authorRole,
      content,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

