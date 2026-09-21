import { supabaseAdmin } from '../config/supabase';

/**
 * Logs every admin-side mutating action.
 * Called from services/routes after successful mutations — never skipped.
 */
export async function logAudit(params: {
  pgId?: string;
  actorId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('audit_log')
    .insert({
      pg_id: params.pgId || null,
      actor_id: params.actorId,
      actor_email: params.actorEmail,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      details: params.details || null,
      ip_address: params.ipAddress || null,
    });

  if (error) {
    // Log the error but don't fail the original request — audit logging
    // should not block business operations
    console.error('Audit log write failed:', error.message);
  }
}

