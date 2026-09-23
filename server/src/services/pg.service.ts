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

  const pgRecord: PG = { ...data };

  // 1. Fetch settings backup for branding/profile extensions if present
  try {
    const { data: settingsData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', `pg_profile_${pgId}`)
      .maybeSingle();

    if (settingsData?.value && typeof settingsData.value === 'object') {
      const val = settingsData.value as Record<string, any>;
      if (!pgRecord.owner_name && val.owner_name) pgRecord.owner_name = val.owner_name;
      if (!pgRecord.tagline && val.tagline) pgRecord.tagline = val.tagline;
      if (!pgRecord.logo_url && val.logo_url) pgRecord.logo_url = val.logo_url;
    }
  } catch (err) {
    console.warn('[pg.service] Notice fetching profile settings fallback:', err);
  }

  // 2. Fallback for owner_name from admins table if still unset
  if (!pgRecord.owner_name) {
    try {
      if (pgRecord.owner_id) {
        const { data: adminData } = await supabaseAdmin
          .from('admins')
          .select('full_name')
          .eq('id', pgRecord.owner_id)
          .maybeSingle();
        if (adminData?.full_name) {
          pgRecord.owner_name = adminData.full_name;
        }
      }
      if (!pgRecord.owner_name) {
        const { data: adminByPg } = await supabaseAdmin
          .from('admins')
          .select('full_name')
          .eq('pg_id', pgId)
          .limit(1)
          .maybeSingle();
        if (adminByPg?.full_name) {
          pgRecord.owner_name = adminByPg.full_name;
        }
      }
    } catch (err) {
      console.warn('[pg.service] Notice fetching admin full_name fallback:', err);
    }
  }

  // Default tagline if not configured
  if (!pgRecord.tagline) {
    pgRecord.tagline = 'PREMIUM PG LIVING';
  }

  return pgRecord;
}

export async function updatePG(
  pgId: string,
  updates: Record<string, unknown>,
  actor: { id: string; email: string }
): Promise<PG> {
  const profileKeys = ['owner_name', 'tagline', 'logo_url'];
  const hasProfileKeys = profileKeys.some((k) => k in updates);

  // Try direct update on pgs table
  const { error } = await supabaseAdmin
    .from('pgs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pgId)
    .select()
    .single();

  if (error) {
    const isMissingColumn =
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      (typeof error.message === 'string' &&
        (error.message.includes('schema cache') ||
          error.message.includes('column') ||
          error.message.includes('does not exist')));

    // If the error indicates missing column (before migration 005 is applied)
    if (isMissingColumn && hasProfileKeys) {
      const coreUpdates: Record<string, unknown> = { ...updates };
      const customProfile: Record<string, unknown> = {};

      for (const k of profileKeys) {
        if (k in coreUpdates) {
          customProfile[k] = coreUpdates[k];
          delete coreUpdates[k];
        }
      }

      // Update core columns on pgs if any core columns changed
      if (Object.keys(coreUpdates).length > 0) {
        const { error: coreErr } = await supabaseAdmin
          .from('pgs')
          .update({
            ...coreUpdates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pgId);

        if (coreErr) {
          throw new Error(coreErr.message);
        }
      }

      // Persist profile extensions to scoped settings table
      await persistProfileToSettings(pgId, customProfile);
    } else {
      throw new Error(error.message);
    }
  } else {
    // Mirror profile keys to settings for cross-compatibility
    if (hasProfileKeys) {
      const customProfile: Record<string, unknown> = {};
      for (const k of profileKeys) {
        if (k in updates) {
          customProfile[k] = updates[k];
        }
      }
      await persistProfileToSettings(pgId, customProfile);
    }
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

  return await getPG(pgId);
}

async function persistProfileToSettings(pgId: string, profileData: Record<string, unknown>) {
  try {
    const key = `pg_profile_${pgId}`;
    const { data: existing } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    const currentVal = (existing?.value && typeof existing.value === 'object') ? existing.value : {};
    const newVal = {
      ...currentVal,
      ...profileData,
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('settings')
      .upsert({
        key,
        value: newVal,
        updated_at: new Date().toISOString(),
      });
  } catch (err) {
    console.warn('[pg.service] Error persisting profile extensions to settings:', err);
  }
}

export async function updatePGLogo(
  pgId: string,
  logoUrl: string | null,
  actor: { id: string; email: string }
): Promise<PG> {
  return updatePG(pgId, { logo_url: logoUrl }, actor);
}

