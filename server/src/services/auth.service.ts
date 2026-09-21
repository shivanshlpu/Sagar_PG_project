import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';
import { AuthUser, UserRole } from '../types';

// Refresh token lifetime: 30 days (bounded but long, so user is not repeatedly prompted)
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '30d';

function generateTokens(user: AuthUser) {
  const accessToken = jwt.sign(user, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ id: user.id, type: 'refresh' }, env.JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
  return { accessToken, refreshToken };
}

export async function register(
  email: string,
  password: string,
  role: 'admin' | 'tenant',
  fullName: string,
  phone?: string,
  pgName?: string
) {
  // Create user in Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm for now
    user_metadata: { role, full_name: fullName },
  });

  if (authError) {
    throw new Error(authError.message);
  }

  const userId = authData.user.id;
  let adminId: string | undefined;
  let pgId: string | undefined;
  let resolvedPgName: string | undefined;

  if (role === 'admin') {
    // 1. Insert into admins table
    const { data: adminRecord, error: adminErr } = await supabaseAdmin
      .from('admins')
      .insert({
        user_id: userId,
        full_name: fullName,
        email,
        phone: phone || null,
      })
      .select('id')
      .single();

    if (adminErr) throw new Error(adminErr.message);
    adminId = adminRecord.id;

    // 2. Create the PG property owned by this admin
    resolvedPgName = pgName?.trim() || `${fullName}'s PG`;
    const { data: pgRecord, error: pgErr } = await supabaseAdmin
      .from('pgs')
      .insert({
        owner_id: adminId,
        name: resolvedPgName,
        phone: phone || null,
        email,
      })
      .select('id, name')
      .single();

    if (pgErr) throw new Error(pgErr.message);
    pgId = pgRecord.id;
    resolvedPgName = pgRecord.name;

    // 3. Initialize default PG settings (Wi-Fi and reminders) for this new PG
    await supabaseAdmin.from('property_settings').insert({
      pg_id: pgId,
      wifi_networks: [
        {
          id: `wifi_${Date.now()}_1`,
          name: `${resolvedPgName}_HighSpeed`,
          password: 'welcome_to_pg',
          floor: 'All Floors',
          notes: 'High speed Wi-Fi for residents',
        },
      ],
      notice_period_days: 30,
    });
  } else {
    // Look up default/first PG if registering as tenant directly
    const { data: defaultPg } = await supabaseAdmin
      .from('pgs')
      .select('id, name')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (defaultPg) {
      pgId = defaultPg.id;
      resolvedPgName = defaultPg.name;
    }

    // Insert into tenants table with pending status
    const { data: tenantRecord, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .insert({
        user_id: userId,
        full_name: fullName,
        email,
        phone: phone || '',
        status: 'pending',
        security_deposit_paise: 0,
        pg_id: pgId || null,
      })
      .select('id, pg_id')
      .single();

    if (tenantErr) throw new Error(tenantErr.message);
    pgId = tenantRecord.pg_id;
  }

  // Get the tenant record ID if role is tenant
  let recordId: string | undefined;
  if (role === 'tenant') {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('id, pg_id')
      .eq('user_id', userId)
      .single();
    recordId = data?.id;
    pgId = data?.pg_id;
  }

  const authUser: AuthUser = {
    id: userId,
    email,
    role,
    adminId,
    tenantId: recordId,
    pgId: pgId || '',
    pgName: resolvedPgName,
  };

  return { user: authUser, tokens: generateTokens(authUser) };
}

export async function login(email: string, password: string) {
  // Use an isolated client so supabaseAdmin's service-role session is never overridden
  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    throw new Error('Invalid email or password');
  }

  const userId = authData.user.id;
  const role = authData.user.user_metadata?.role as 'admin' | 'tenant';

  let tenantId: string | undefined;
  let adminId: string | undefined;
  let pgId: string | undefined;
  let pgName: string | undefined;

  if (role === 'tenant') {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('id, pg_id, pg:pgs(name)')
      .eq('user_id', userId)
      .single();
    tenantId = data?.id;
    pgId = data?.pg_id;
    pgName = (data?.pg as any)?.name;
  } else if (role === 'admin') {
    const { data: adminRecord } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (adminRecord) {
      adminId = adminRecord.id;
      // Look up PG owned by this admin
      const { data: pgRecord } = await supabaseAdmin
        .from('pgs')
        .select('id, name')
        .eq('owner_id', adminRecord.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (pgRecord) {
        pgId = pgRecord.id;
        pgName = pgRecord.name;
      } else {
        // Create initial default PG for admin if none exists yet
        const defaultName = `${authData.user.user_metadata?.full_name || 'My'} PG`;
        const { data: newPg } = await supabaseAdmin
          .from('pgs')
          .insert({
            owner_id: adminRecord.id,
            name: defaultName,
            email,
          })
          .select('id, name')
          .single();
        if (newPg) {
          pgId = newPg.id;
          pgName = newPg.name;
        }
      }
    }
  }

  const authUser: AuthUser = {
    id: userId,
    email,
    role: role || 'tenant',
    adminId,
    tenantId,
    pgId: pgId || '',
    pgName,
  };

  return { user: authUser, tokens: generateTokens(authUser) };
}

export async function refreshAccessToken(refreshToken: string) {
  try {
    const decoded = jwt.verify(refreshToken, env.JWT_SECRET) as { id: string; type: string };
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(decoded.id);
    if (userError || !userData?.user) {
      throw new Error('User not found');
    }

    const role = (userData.user.user_metadata?.role as UserRole) || 'tenant';
    let adminId: string | undefined;
    let tenantId: string | undefined;
    let pgId: string | undefined;
    let pgName: string | undefined;

    if (role === 'admin') {
      const { data: adminRecord } = await supabaseAdmin
        .from('admins')
        .select('id')
        .eq('user_id', decoded.id)
        .single();
      adminId = adminRecord?.id;
      if (adminId) {
        const { data: pgRecord } = await supabaseAdmin
          .from('pgs')
          .select('id, name')
          .eq('owner_id', adminId)
          .order('created_at', { ascending: true })
          .limit(1)
          .single();
        pgId = pgRecord?.id;
        pgName = pgRecord?.name;
      }
    } else {
      const { data: tenantRecord } = await supabaseAdmin
        .from('tenants')
        .select('id, pg_id, pgs(name)')
        .eq('user_id', decoded.id)
        .single();
      tenantId = tenantRecord?.id;
      pgId = tenantRecord?.pg_id;
      const pgData = (tenantRecord as any)?.pgs;
      pgName = Array.isArray(pgData) ? pgData[0]?.name : pgData?.name;
    }

    const authUser: AuthUser = {
      id: decoded.id,
      email: userData.user.email || '',
      role: role || 'tenant',
      adminId,
      tenantId,
      pgId: pgId || '',
      pgName,
    };

    return { user: authUser, tokens: generateTokens(authUser) };
  } catch (_err) {
    throw new Error('Invalid or expired refresh token');
  }
}

export async function getMe(userId: string) {
  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !userData.user) {
    throw new Error('User not found');
  }

  const role = userData.user.user_metadata?.role as 'admin' | 'tenant';

  if (role === 'tenant') {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*, pg:pgs(*)')
      .eq('user_id', userId)
      .single();
    return {
      ...userData.user,
      role,
      tenant,
      pg: tenant?.pg,
      pgId: tenant?.pg_id,
      pgName: tenant?.pg?.name,
    };
  }

  if (role === 'admin') {
    const { data: admin } = await supabaseAdmin
      .from('admins')
      .select('*')
      .eq('user_id', userId)
      .single();

    let pg: any = null;
    if (admin) {
      const { data: pgRecord } = await supabaseAdmin
        .from('pgs')
        .select('*')
        .eq('owner_id', admin.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      pg = pgRecord;
    }

    return {
      ...userData.user,
      role,
      admin,
      pg,
      pgId: pg?.id,
      pgName: pg?.name,
    };
  }

  return { ...userData.user, role };
}
