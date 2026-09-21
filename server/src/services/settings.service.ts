import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';

export interface WifiNetwork {
  id: string;
  name: string;
  password: string;
  floor?: string | null;
  notes?: string | null;
}

export async function getWifiSettings(pgId: string): Promise<{ networks: WifiNetwork[] }> {
  const { data, error } = await supabaseAdmin
    .from('property_settings')
    .select('wifi_networks')
    .eq('pg_id', pgId)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);

  if (data?.wifi_networks && Array.isArray(data.wifi_networks)) {
    return { networks: data.wifi_networks as WifiNetwork[] };
  }

  return { networks: [] };
}

export async function updateWifiSettings(
  pgId: string,
  settings: { networks?: WifiNetwork[]; network_name?: string; password?: string; notes?: string | null },
  actor: { id: string; email: string }
) {
  let networks: WifiNetwork[] = [];

  if (Array.isArray(settings.networks)) {
    networks = settings.networks.map((n, idx) => ({
      id: n.id || `wifi_${Date.now()}_${idx}`,
      name: n.name,
      password: n.password,
      floor: n.floor || 'All Floors',
      notes: n.notes || null,
    }));
  } else if (settings.network_name) {
    networks = [{
      id: 'default',
      name: settings.network_name,
      password: settings.password || '',
      floor: 'All Floors',
      notes: settings.notes || null,
    }];
  }

  const { error } = await supabaseAdmin
    .from('property_settings')
    .upsert({
      pg_id: pgId,
      wifi_networks: networks,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pg_id' })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_WIFI_SETTINGS',
    entityType: 'settings',
    entityId: 'wifi',
  });

  return { networks };
}

export async function getReminderSettings(pgId: string) {
  const { data, error } = await supabaseAdmin
    .from('property_settings')
    .select('notice_period_days')
    .eq('pg_id', pgId)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);

  return {
    rent_reminder_day: 1,
    rent_due_day: 5,
    late_fee_grace_days: 5,
    late_fee_paise: 0,
    notice_period_days: data?.notice_period_days || 30,
    electricity_reminder_enabled: true,
  };
}

export async function updateReminderSettings(
  pgId: string,
  settings: Record<string, unknown>,
  actor: { id: string; email: string }
) {
  const { error } = await supabaseAdmin
    .from('property_settings')
    .upsert({
      pg_id: pgId,
      notice_period_days: (settings.notice_period_days as number) || 30,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pg_id' });

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_REMINDER_SETTINGS',
    entityType: 'settings',
    entityId: 'reminders',
  });
}

export interface BillingSettings {
  electricity_rate_per_unit_paise: number;
  maintenance_charge_paise: number;
}

export async function getBillingSettings(pgId: string): Promise<BillingSettings> {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', `billing_${pgId}`)
    .maybeSingle();

  if (error) {
    console.error('getBillingSettings error:', error);
  }

  if (data?.value && typeof data.value === 'object') {
    return {
      electricity_rate_per_unit_paise: data.value.electricity_rate_per_unit_paise ?? 1200,
      maintenance_charge_paise: data.value.maintenance_charge_paise ?? 50000,
    };
  }

  return {
    electricity_rate_per_unit_paise: 1200,
    maintenance_charge_paise: 50000,
  };
}

export async function updateBillingSettings(
  pgId: string,
  settings: Partial<BillingSettings>,
  actor: { id: string; email: string }
): Promise<BillingSettings> {
  const current = await getBillingSettings(pgId);
  const updated: BillingSettings = {
    electricity_rate_per_unit_paise:
      settings.electricity_rate_per_unit_paise !== undefined
        ? Math.max(0, Math.round(settings.electricity_rate_per_unit_paise))
        : current.electricity_rate_per_unit_paise,
    maintenance_charge_paise:
      settings.maintenance_charge_paise !== undefined
        ? Math.max(0, Math.round(settings.maintenance_charge_paise))
        : current.maintenance_charge_paise,
  };

  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({
      key: `billing_${pgId}`,
      value: updated,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_BILLING_SETTINGS',
    entityType: 'settings',
    entityId: `billing_${pgId}`,
    details: { ...updated },
  });

  return updated;
}

export async function listContacts(pgId: string) {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('pg_id', pgId)
    .order('is_emergency', { ascending: false })
    .order('name');

  if (error) throw new Error(error.message);
  return data || [];
}

export async function createContact(
  pgId: string,
  contactData: { name: string; role: string; phone: string; email?: string | null; is_emergency?: boolean },
  actor: { id: string; email: string }
) {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert({ ...contactData, pg_id: pgId })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'CREATE_CONTACT',
    entityType: 'contact',
    entityId: data.id,
  });

  return data;
}

export async function updateContact(
  pgId: string,
  id: string,
  updates: Record<string, unknown>,
  actor: { id: string; email: string }
) {
  const { data, error } = await supabaseAdmin
    .from('contacts')
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
    action: 'UPDATE_CONTACT',
    entityType: 'contact',
    entityId: id,
  });

  return data;
}

export async function deleteContact(
  pgId: string,
  id: string,
  actor: { id: string; email: string }
) {
  const { error } = await supabaseAdmin
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('pg_id', pgId);

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'DELETE_CONTACT',
    entityType: 'contact',
    entityId: id,
  });
}

