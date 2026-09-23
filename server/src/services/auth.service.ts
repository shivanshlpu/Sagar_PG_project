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

// ── Password Reset (Multi-PG Isolated WhatsApp OTP) ──────────────

import { createOtpRequest, verifyOtpRequest } from './otp.service';
import { sendWhatsAppMessage, getWhatsAppStatus, normalizePhoneNumber } from './whatsapp.service';

interface ResolvedUserContext {
  userId: string;
  pgId: string;
  pgName: string;
  phone: string;
  fullName: string;
  role: 'admin' | 'tenant';
}

/**
 * Authoritatively resolves user identity, PG association, phone, and role.
 * Queries indexed database tables (tenants/admins -> pgs) instead of client input.
 */
async function resolveUserAndPgByEmail(email: string): Promise<ResolvedUserContext | null> {
  const cleanEmail = email.toLowerCase().trim();

  // 1. Try tenants table
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, user_id, full_name, phone, pg_id, status, pg:pgs(id, name)')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (tenant && tenant.user_id && tenant.pg_id) {
    const pgName = (tenant.pg as any)?.name || 'PG Residency';
    return {
      userId: tenant.user_id,
      pgId: tenant.pg_id,
      pgName,
      phone: tenant.phone || '',
      fullName: tenant.full_name || 'Resident',
      role: 'tenant',
    };
  }

  // 2. Try admins table
  const { data: admin } = await supabaseAdmin
    .from('admins')
    .select('id, user_id, full_name, phone, email')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (admin && admin.user_id) {
    // Look up PG owned by this admin
    const { data: pg } = await supabaseAdmin
      .from('pgs')
      .select('id, name')
      .eq('owner_id', admin.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pg) {
      return {
        userId: admin.user_id,
        pgId: pg.id,
        pgName: pg.name || 'PG Management',
        phone: admin.phone || '',
        fullName: admin.full_name || 'PG Manager',
        role: 'admin',
      };
    }
  }

  return null;
}

/**
 * Initiate forgot-password flow with strict Multi-PG isolation:
 *  1. Authoritatively resolve user, PG context, and phone
 *  2. Validate that the user's specific PG has an active WhatsApp connection
 *  3. Generate a cryptographically hashed, PG-scoped OTP
 *  4. Dispatch exclusively via the user's PG WhatsApp session (never default or another PG)
 */
export async function forgotPassword(email: string) {
  const userContext = await resolveUserAndPgByEmail(email);

  if (!userContext) {
    // Anti-enumeration: Return generic success without revealing non-existent email
    return { sent: true, maskedPhone: '******' };
  }

  const { userId, pgId, pgName, phone, fullName } = userContext;

  if (!phone || phone.replace(/\D/g, '').length < 10) {
    throw new Error(`No phone number linked to this account in ${pgName}. Please contact the PG manager.`);
  }

  // Verify that THIS PG's WhatsApp account is connected
  const waStatus = getWhatsAppStatus(pgId);
  if (waStatus.status !== 'connected') {
    throw new Error(
      `WhatsApp service is not connected for ${pgName}. Please contact your PG manager to connect WhatsApp.`
    );
  }

  const normalizedPhone = normalizePhoneNumber(phone);

  // Generate cryptographically secure OTP bound to (userId, pgId, 'password_reset')
  const otp = await createOtpRequest({
    userId,
    pgId,
    phone: normalizedPhone,
    purpose: 'password_reset',
  });

  console.log(`[ForgotPassword] Dispatching PG [${pgId} - ${pgName}] OTP to ${normalizedPhone.slice(0, 4)}****`);

  // Build branded PG-specific message
  const message =
    `🔐 *${pgName} — Password Reset*\n\n` +
    `Dear *${fullName}*,\n\n` +
    `Your password reset OTP is: *${otp}*\n\n` +
    `This code expires in 5 minutes. Do not share it with anyone.`;

  // Dispatch strictly through the user's PG WhatsApp sender
  await sendWhatsAppMessage(normalizedPhone, message, {
    pgId,
    purpose: 'PASSWORD_RESET_OTP',
  });

  // Mask phone for user feedback (e.g. +91 98****3210)
  const masked = `+${normalizedPhone.slice(0, 2)} ${normalizedPhone.slice(2, 4)}****${normalizedPhone.slice(-4)}`;
  return { sent: true, maskedPhone: masked, pgName };
}

/**
 * Verifies the OTP within its strict PG boundary and returns a reset JWT.
 */
export async function verifyOtpAndGetResetToken(email: string, otp: string) {
  const userContext = await resolveUserAndPgByEmail(email);
  if (!userContext) throw new Error('Invalid request');

  const { userId, pgId } = userContext;

  const valid = await verifyOtpRequest({
    userId,
    pgId,
    code: otp,
    purpose: 'password_reset',
  });

  if (!valid) throw new Error('Invalid OTP. Please check the code and try again.');

  // Issue a short-lived reset token (10 min) binding user ID and PG ID
  const resetToken = jwt.sign(
    { id: userId, pgId, email: email.toLowerCase().trim(), type: 'password-reset' },
    env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  return { resetToken, pgName: userContext.pgName };
}

/**
 * Reset password using a validated, PG-bound reset token.
 */
export async function resetPassword(resetToken: string, newPassword: string) {
  let decoded: { id: string; pgId: string; type: string };
  try {
    decoded = jwt.verify(resetToken, env.JWT_SECRET) as any;
  } catch {
    throw new Error('Reset link has expired. Please request a new OTP.');
  }

  if (decoded.type !== 'password-reset' || !decoded.id || !decoded.pgId) {
    throw new Error('Invalid reset token.');
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(decoded.id, {
    password: newPassword,
  });

  if (error) throw new Error('Failed to update password. Please try again.');

  // Invalidate any remaining OTPs for this user and PG
  try {
    await supabaseAdmin
      .from('otp_requests')
      .update({ status: 'verified', updated_at: new Date().toISOString() })
      .eq('user_id', decoded.id)
      .eq('pg_id', decoded.pgId);
  } catch {}

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

