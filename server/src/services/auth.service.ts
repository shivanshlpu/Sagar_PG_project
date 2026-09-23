import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';
import { AuthUser, UserRole } from '../types';
import { createNotification } from './notifications.service';

// Persistent session lifetimes: 30 days access token, 365 days refresh token
// Neither tenants nor admins are repeatedly forced to log in
const ACCESS_TOKEN_EXPIRY = '30d';
const REFRESH_TOKEN_EXPIRY = '365d';

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

    // Notify PG Admin about new tenant registration
    if (pgId) {
      (async () => {
        try {
          const { data: pgData } = await supabaseAdmin
            .from('pgs')
            .select('name, owner:admins!owner_id(user_id, phone, full_name)')
            .eq('id', pgId)
            .single();

          const ownerUser = (pgData?.owner as any);
          if (ownerUser?.user_id) {
            await createNotification({
              userId: ownerUser.user_id,
              title: 'New Tenant Registered',
              message: `${fullName} (${phone || email}) has registered and is pending onboarding.`,
              type: 'tenant_registered',
              metadata: { tenantId: tenantRecord.id, email, phone },
            });

            if (ownerUser.phone) {
              const alertMsg = `📢 *New Tenant Registration — Sagar PG*\n\nName: *${fullName}*\nPhone: *${phone || 'N/A'}*\nEmail: *${email}*\n\nPlease review in the Admin Portal.`;
              await sendWhatsAppMessage(ownerUser.phone, alertMsg, { pgId });
            }
          }
        } catch (e: any) {
          console.warn('[Notification] Failed to alert admin of new tenant:', e.message);
        }
      })();
    }
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

// ── Password Reset (WhatsApp OTP) ──────────────────────────────

import { generateOTP, verifyOTP } from './otp.service';
import { sendWhatsAppMessage, getWhatsAppStatus, normalizePhoneNumber } from './whatsapp.service';

/**
 * Initiate forgot-password flow:
 *  1. Find the user by email
 *  2. Look up their phone number from admins or tenants table
 *  3. Generate OTP and send via WhatsApp
 */
export async function forgotPassword(email: string) {
  // Check WhatsApp is connected
  const waStatus = getWhatsAppStatus();
  if (waStatus.status !== 'connected') {
    throw new Error('WhatsApp service is not connected. Please contact the PG admin.');
  }

  // Find user in Supabase Auth
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  const user = listData?.users.find(u => u.email === email);
  if (!user) {
    // Don't reveal whether email exists — return silently
    return { sent: true, maskedPhone: '******' };
  }

  const role = user.user_metadata?.role as string;
  let phone: string | null = null;

  if (role === 'admin') {
    const { data } = await supabaseAdmin.from('admins').select('phone').eq('user_id', user.id).single();
    phone = data?.phone || null;
  } else {
    const { data } = await supabaseAdmin.from('tenants').select('phone').eq('user_id', user.id).single();
    phone = data?.phone || null;
  }

  if (!phone || phone.replace(/\D/g, '').length < 10) {
    throw new Error('No phone number linked to this account. Contact the PG admin.');
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  const otp = generateOTP(normalizedPhone);

  console.log(`[ForgotPassword] Sending OTP to ${normalizedPhone} for user ${email}`);

  // Send OTP via WhatsApp
  const message = `🔐 *Sagar PG — Password Reset*\n\nYour OTP is: *${otp}*\n\nThis code expires in 5 minutes. Do not share it with anyone.`;
  await sendWhatsAppMessage(normalizedPhone, message);

  // Mask phone for frontend display (e.g. +91 90****9694)
  const masked = `+${normalizedPhone.slice(0, 2)} ${normalizedPhone.slice(2, 4)}****${normalizedPhone.slice(-4)}`;
  return { sent: true, maskedPhone: masked };
}

/**
 * Verify the OTP and return a short-lived password-reset JWT.
 */
export async function verifyOtpAndGetResetToken(email: string, otp: string) {
  // Find user → phone
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  const user = listData?.users.find(u => u.email === email);
  if (!user) throw new Error('Invalid request');

  const role = user.user_metadata?.role as string;
  let phone: string | null = null;

  if (role === 'admin') {
    const { data } = await supabaseAdmin.from('admins').select('phone').eq('user_id', user.id).single();
    phone = data?.phone || null;
  } else {
    const { data } = await supabaseAdmin.from('tenants').select('phone').eq('user_id', user.id).single();
    phone = data?.phone || null;
  }

  if (!phone) throw new Error('Invalid request');

  const normalizedPhone = normalizePhoneNumber(phone);
  const valid = verifyOTP(normalizedPhone, otp);
  if (!valid) throw new Error('Invalid OTP. Please try again.');

  // Issue a short-lived reset token (10 min)
  const resetToken = jwt.sign(
    { id: user.id, email, type: 'password-reset' },
    env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  return { resetToken };
}

/**
 * Reset password using a valid reset token.
 */
export async function resetPassword(resetToken: string, newPassword: string) {
  let decoded: { id: string; type: string };
  try {
    decoded = jwt.verify(resetToken, env.JWT_SECRET) as any;
  } catch {
    throw new Error('Reset link has expired. Please request a new OTP.');
  }

  if (decoded.type !== 'password-reset') {
    throw new Error('Invalid reset token.');
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(decoded.id, {
    password: newPassword,
  });

  if (error) throw new Error('Failed to update password. Please try again.');
  return { success: true };
}

/**
 * Change password for an authenticated user (requires current password).
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  // Get user email
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.email) throw new Error('User not found');

  // Verify current password by attempting sign-in
  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { error: signInError } = await authClient.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });

  if (signInError) throw new Error('Current password is incorrect');

  // Update to new password
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (updateError) throw new Error('Failed to update password');
  return { success: true };
}

