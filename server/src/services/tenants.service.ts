import { supabaseAdmin } from '../config/supabase';
import { logAudit } from './auditLog.service';
import { createNotification } from './notifications.service';
import { sendWhatsAppMessage } from './whatsapp.service';
import { formatDateDMY } from '../utils/date';
import crypto from 'crypto';

function parseTenantMetadata(tenant: any) {
  if (!tenant) return tenant;
  let parsedNotes: any = null;
  if (tenant.notes) {
    try {
      parsedNotes = JSON.parse(tenant.notes);
    } catch {
      // plain text note
    }
  }
  return {
    ...tenant,
    gender: tenant.gender || parsedNotes?.gender || null,
    date_of_birth: tenant.date_of_birth || parsedNotes?.date_of_birth || null,
    id_proof_type: tenant.id_proof_type || parsedNotes?.id_proof_type || null,
    id_proof_number: tenant.id_proof_number || parsedNotes?.id_proof_number || null,
    college_name: parsedNotes?.college_name || null,
  };
}

export async function listTenants(
  pgId: string,
  filters?: { status?: string; room_id?: string; search?: string }
) {
  let query = supabaseAdmin
    .from('tenants')
    .select('*, room:rooms!room_id(room_number, floor), bed:beds!bed_id(bed_number)')
    .eq('pg_id', pgId);

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.room_id) query = query.eq('room_id', filters.room_id);
  if (filters?.search) {
    query = query.or(`full_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(parseTenantMetadata);
}

export async function getTenant(pgId: string, id: string) {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*, room:rooms!room_id(room_number, floor), bed:beds!bed_id(bed_number), tenant_documents(*)')
    .eq('id', id)
    .eq('pg_id', pgId)
    .single();

  if (error || !data) throw new Error('Tenant not found');

  // Generate signed URLs for documents if present
  if (data.tenant_documents && data.tenant_documents.length > 0) {
    const docsWithUrls = await Promise.all(
      data.tenant_documents.map(async (doc: any) => {
        try {
          const { data: urlData } = await supabaseAdmin.storage
            .from('tenant-documents')
            .createSignedUrl(doc.file_path, 3600);
          return { ...doc, signed_url: urlData?.signedUrl || null };
        } catch {
          return { ...doc, signed_url: null };
        }
      })
    );
    data.tenant_documents = docsWithUrls;
  }

  return parseTenantMetadata(data);
}

export async function createTenant(
  pgId: string,
  tenantData: {
    full_name: string;
    phone: string;
    email: string;
    gender?: string | null;
    date_of_birth?: string | null;
    id_proof_type?: string | null;
    id_proof_number?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
    permanent_address?: string | null;
    room_id?: string | null;
    bed_id?: string | null;
    move_in_date?: string | null;
    expected_leaving_date?: string | null;
    security_deposit_paise?: number;
    notes?: string | null;
  },
  actor: { id: string; email: string }
) {
  // Validate room and bed if provided
  if (tenantData.room_id) {
    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('id')
      .eq('id', tenantData.room_id)
      .eq('pg_id', pgId)
      .single();
    if (!room) throw new Error('Selected room does not exist in your PG');
  }

  if (tenantData.bed_id) {
    const { data: bed } = await supabaseAdmin
      .from('beds')
      .select('id, status')
      .eq('id', tenantData.bed_id)
      .eq('pg_id', pgId)
      .single();
    if (!bed) throw new Error('Selected bed does not exist in your PG');
    if (bed.status === 'occupied') throw new Error('Selected bed is already occupied');
  }

  // Create a Supabase Auth user for the tenant
  const tempPassword = crypto.randomBytes(12).toString('hex');
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: tenantData.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role: 'tenant', full_name: tenantData.full_name, pg_id: pgId },
  });

  if (authError) throw new Error(authError.message);

  const metadata = {
    gender: tenantData.gender || null,
    date_of_birth: tenantData.date_of_birth || null,
    id_proof_type: tenantData.id_proof_type || null,
    id_proof_number: tenantData.id_proof_number || null,
    notes: tenantData.notes || null,
  };

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .insert({
      pg_id: pgId,
      user_id: authData.user.id,
      full_name: tenantData.full_name,
      phone: tenantData.phone,
      email: tenantData.email,
      emergency_contact_name: tenantData.emergency_contact_name || null,
      emergency_contact_phone: tenantData.emergency_contact_phone || null,
      permanent_address: tenantData.permanent_address || null,
      room_id: tenantData.room_id || null,
      bed_id: tenantData.bed_id || null,
      move_in_date: tenantData.move_in_date || null,
      expected_leaving_date: tenantData.expected_leaving_date || null,
      security_deposit_paise: tenantData.security_deposit_paise || 0,
      status: tenantData.room_id && tenantData.bed_id ? 'active' : 'pending',
      notes: JSON.stringify(metadata),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // If bed was assigned, update bed status and room count
  if (tenantData.bed_id && tenantData.room_id) {
    await supabaseAdmin
      .from('beds')
      .update({ status: 'occupied', tenant_id: data.id, updated_at: new Date().toISOString() })
      .eq('id', tenantData.bed_id)
      .eq('pg_id', pgId);

    const { data: occupiedBeds } = await supabaseAdmin
      .from('beds')
      .select('id')
      .eq('room_id', tenantData.room_id)
      .eq('pg_id', pgId)
      .eq('status', 'occupied');

    const occupiedCount = occupiedBeds?.length || 0;
    const { data: roomRecord } = await supabaseAdmin
      .from('rooms')
      .select('total_beds')
      .eq('id', tenantData.room_id)
      .eq('pg_id', pgId)
      .single();

    await supabaseAdmin
      .from('rooms')
      .update({
        occupied_beds: occupiedCount,
        status: occupiedCount >= (roomRecord?.total_beds || 0) ? 'full' : 'available',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantData.room_id)
      .eq('pg_id', pgId);
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'CREATE_TENANT',
    entityType: 'tenant',
    entityId: data.id,
    details: { tenant_name: tenantData.full_name },
  });

  return { ...data, tempPassword };
}

export async function updateTenant(
  pgId: string,
  id: string,
  updates: Record<string, unknown>,
  actor: { id: string; email: string }
) {
  // Ensure tenant exists in this PG
  const existing = await getTenant(pgId, id);

  const { gender, date_of_birth, id_proof_type, id_proof_number, college_name, ...dbUpdates } = updates as any;
  if (gender !== undefined || date_of_birth !== undefined || id_proof_type !== undefined || id_proof_number !== undefined || college_name !== undefined) {
    const meta = {
      gender: gender !== undefined ? gender : existing.gender,
      date_of_birth: date_of_birth !== undefined ? date_of_birth : existing.date_of_birth,
      id_proof_type: id_proof_type !== undefined ? id_proof_type : existing.id_proof_type,
      id_proof_number: id_proof_number !== undefined ? id_proof_number : existing.id_proof_number,
      college_name: college_name !== undefined ? college_name : existing.college_name,
    };
    (dbUpdates as any).notes = JSON.stringify(meta);
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update({ ...dbUpdates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('pg_id', pgId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPDATE_TENANT',
    entityType: 'tenant',
    entityId: id,
    details: updates,
  });

  return parseTenantMetadata(data);
}

export async function deleteTenant(pgId: string, id: string, actor: { id: string; email: string }) {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('user_id, status, bed_id, room_id')
    .eq('id', id)
    .eq('pg_id', pgId)
    .single();

  if (!tenant) throw new Error('Tenant not found');

  if (tenant.status === 'active') {
    throw new Error('Cannot delete an active tenant. Process move-out first.');
  }

  const { error } = await supabaseAdmin
    .from('tenants')
    .delete()
    .eq('id', id)
    .eq('pg_id', pgId);

  if (error) throw new Error(error.message);

  // Clean up Supabase Auth user
  if (tenant.user_id) {
    await supabaseAdmin.auth.admin.deleteUser(tenant.user_id);
  }

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'DELETE_TENANT',
    entityType: 'tenant',
    entityId: id,
  });
}

export async function generateRegistrationLink(pgId: string, actor: { id: string; email: string }) {
  // Generate a clean, high-entropy ticket code with PG- prefix
  const code = `PG-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

  // Store ONLY the SHA-256 hash in the database — never plaintext
  const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const { data, error } = await supabaseAdmin
    .from('registration_tokens')
    .insert({
      pg_id: pgId,
      token: tokenHash,
      created_by: actor.id,
      expires_at: expiresAt.toISOString(),
      used: false,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'GENERATE_REGISTRATION_LINK',
    entityType: 'registration_token',
    entityId: data.id,
  });

  return { token: code, expiresAt };
}

export async function getInviteInfo(code: string) {
  if (!code || typeof code !== 'string') {
    throw new Error('Invalid invite link');
  }

  // Compute SHA-256 hash to look up token
  const tokenHash = crypto.createHash('sha256').update(code.trim()).digest('hex');

  const { data: tokenRecord, error: tokenError } = await supabaseAdmin
    .from('registration_tokens')
    .select('id, pg_id, expires_at, used')
    .eq('token', tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRecord) {
    throw new Error('Invalid or expired registration link');
  }

  if (tokenRecord.used) {
    throw new Error('This registration link has already been used');
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    throw new Error('This registration link has expired');
  }

  // Fetch PG details for the onboarding banner
  const { data: pg, error: pgError } = await supabaseAdmin
    .from('pgs')
    .select('name, address, phone')
    .eq('id', tokenRecord.pg_id)
    .single();

  if (pgError || !pg) {
    throw new Error('PG property not found');
  }

  return {
    valid: true,
    pgName: pg.name,
    address: pg.address,
    expiresAt: tokenRecord.expires_at,
  };
}

export async function selfRegister(
  code: string,
  tenantData: { full_name: string; email: string; phone: string; password: string }
) {
  if (!code || typeof code !== 'string') {
    throw new Error('Invalid registration link');
  }

  if (!tenantData.password || tenantData.password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  // Compute SHA-256 hash to look up token
  const tokenHash = crypto.createHash('sha256').update(code.trim()).digest('hex');

  // Validate token by its SHA-256 hash
  const { data: tokenRecord, error: tokenError } = await supabaseAdmin
    .from('registration_tokens')
    .select('*')
    .eq('token', tokenHash)
    .eq('used', false)
    .maybeSingle();

  if (tokenError || !tokenRecord) {
    throw new Error('Invalid or expired registration link');
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    throw new Error('Registration link has expired');
  }

  const pgId = tokenRecord.pg_id;

  // Create auth user — Supabase Auth automatically hashes with salted bcrypt cost factor 10
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: tenantData.email.toLowerCase().trim(),
    password: tenantData.password,
    email_confirm: true,
    user_metadata: { role: 'tenant', full_name: tenantData.full_name.trim(), pg_id: pgId },
  });

  if (authError) throw new Error(authError.message);

  // Create tenant record
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      pg_id: pgId,
      user_id: authData.user.id,
      full_name: tenantData.full_name.trim(),
      email: tenantData.email.toLowerCase().trim(),
      phone: tenantData.phone.trim(),
      status: 'pending',
      security_deposit_paise: 0,
    })
    .select()
    .single();

  if (tenantError) throw new Error(tenantError.message);

  // Invalidate token immediately
  await supabaseAdmin
    .from('registration_tokens')
    .update({ used: true })
    .eq('id', tokenRecord.id);

  return tenant;
}

export async function uploadDocument(
  pgId: string,
  tenantId: string,
  file: Express.Multer.File,
  actor: { id: string; email: string }
) {
  // Verify tenant belongs to PG
  await getTenant(pgId, tenantId);

  // Generate safe filename — never use user-supplied filename
  const ext = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
  const allowedExts = ['jpg', 'jpeg', 'png', 'pdf', 'webp'];
  if (!allowedExts.includes(ext)) {
    throw new Error('File type not allowed. Allowed: jpg, jpeg, png, pdf, webp');
  }

  // Validate MIME type server-side
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedMimes.includes(file.mimetype)) {
    throw new Error('Invalid file type');
  }

  // Max 2MB to prevent database and disk flooding
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('File size exceeds 2MB limit');
  }

  const safeFilename = `${pgId}/${tenantId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from('tenant-documents')
    .upload(safeFilename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw new Error(error.message);

  // Save document record
  const { data: doc, error: docError } = await supabaseAdmin
    .from('tenant_documents')
    .insert({
      tenant_id: tenantId,
      file_path: data.path,
      file_name: file.originalname,
      file_type: ext,
      file_size: file.size,
    })
    .select()
    .single();

  if (docError) throw new Error(docError.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'UPLOAD_DOCUMENT',
    entityType: 'tenant_document',
    entityId: doc.id,
    details: { tenant_id: tenantId, file_type: ext },
  });

  return doc;
}

export async function getDocumentSignedUrl(pgId: string, tenantId: string, docId: string) {
  // Verify tenant belongs to PG
  await getTenant(pgId, tenantId);

  const { data: doc, error } = await supabaseAdmin
    .from('tenant_documents')
    .select('file_path')
    .eq('id', docId)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !doc) throw new Error('Document not found');

  // Signed URL with 1-hour expiry
  const { data: urlData, error: urlError } = await supabaseAdmin.storage
    .from('tenant-documents')
    .createSignedUrl(doc.file_path, 3600);

  if (urlError) throw new Error(urlError.message);

  return urlData.signedUrl;
}

export async function completeTenantOnboarding(
  pgId: string,
  tenantId: string,
  onboardingData: {
    gender: string;
    date_of_birth: string;
    permanent_address: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    room_id: string;
    bed_id: string;
    move_in_date: string;
    id_proof_number: string;
    college_name?: string;
  },
  files: {
    aadhaar_card?: Express.Multer.File;
    college_id?: Express.Multer.File;
  },
  actor: { id: string; email: string }
) {
  // 1. Verify tenant belongs to PG
  const tenant = await getTenant(pgId, tenantId);

  // 2. Validate mandatory files
  if (!files.aadhaar_card) {
    throw new Error('Aadhaar Card document image is mandatory');
  }
  if (!files.college_id) {
    throw new Error('College / Student ID document image is mandatory');
  }

  // 3. Validate mandatory fields
  if (!onboardingData.gender) throw new Error('Gender is required');
  if (!onboardingData.date_of_birth) throw new Error('Date of birth is required');
  if (!onboardingData.permanent_address) throw new Error('Permanent address is required');
  if (!onboardingData.emergency_contact_name) throw new Error('Emergency contact name is required');
  if (!onboardingData.emergency_contact_phone) throw new Error('Emergency contact phone is required');
  if (!onboardingData.room_id) throw new Error('Room selection is required');
  if (!onboardingData.bed_id) throw new Error('Bed selection is required');
  if (!onboardingData.move_in_date) throw new Error('Move-in date is required');
  if (!onboardingData.id_proof_number) throw new Error('Aadhaar ID number is required');

  // 4. Validate Room & Bed
  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('id, room_number, occupied_beds, total_beds')
    .eq('id', onboardingData.room_id)
    .eq('pg_id', pgId)
    .single();

  if (!room) throw new Error('Selected room not found');

  const { data: bed } = await supabaseAdmin
    .from('beds')
    .select('id, bed_number, status')
    .eq('id', onboardingData.bed_id)
    .eq('room_id', onboardingData.room_id)
    .eq('pg_id', pgId)
    .single();

  if (!bed) throw new Error('Selected bed not found in this room');
  if (bed.status === 'occupied' && tenant.bed_id !== onboardingData.bed_id) {
    throw new Error('Selected bed is already occupied. Please choose another bed.');
  }

async function ensureDocumentsBucket() {
  try {
    const { data: bucket } = await supabaseAdmin.storage.getBucket('tenant-documents');
    if (!bucket) {
      await supabaseAdmin.storage.createBucket('tenant-documents', {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
      });
    }
  } catch (_err) {
    // Ignore if already exists
  }
}

  // 5. Upload Aadhaar Card
  await ensureDocumentsBucket();
  const aadhaarExt = files.aadhaar_card.originalname.split('.').pop()?.toLowerCase() || 'jpg';
  const aadhaarSafeName = `${pgId}/${tenantId}/aadhaar_${crypto.randomUUID()}.${aadhaarExt}`;
  const { data: aadhaarUpload, error: aadhaarErr } = await supabaseAdmin.storage
    .from('tenant-documents')
    .upload(aadhaarSafeName, files.aadhaar_card.buffer, {
      contentType: files.aadhaar_card.mimetype,
      upsert: false,
    });
  if (aadhaarErr) throw new Error(`Aadhaar upload failed: ${aadhaarErr.message}`);

  await supabaseAdmin.from('tenant_documents').insert({
    tenant_id: tenantId,
    file_path: aadhaarUpload.path,
    file_name: `Aadhaar Card - ${files.aadhaar_card.originalname}`,
    file_type: aadhaarExt,
    file_size: files.aadhaar_card.size,
  });

  // 6. Upload College ID
  const collegeExt = files.college_id.originalname.split('.').pop()?.toLowerCase() || 'jpg';
  const collegeSafeName = `${pgId}/${tenantId}/college_id_${crypto.randomUUID()}.${collegeExt}`;
  const { data: collegeUpload, error: collegeErr } = await supabaseAdmin.storage
    .from('tenant-documents')
    .upload(collegeSafeName, files.college_id.buffer, {
      contentType: files.college_id.mimetype,
      upsert: false,
    });
  if (collegeErr) throw new Error(`College ID upload failed: ${collegeErr.message}`);

  await supabaseAdmin.from('tenant_documents').insert({
    tenant_id: tenantId,
    file_path: collegeUpload.path,
    file_name: `College ID - ${files.college_id.originalname}`,
    file_type: collegeExt,
    file_size: files.college_id.size,
  });

  // 7. Update Bed & Room status
  await supabaseAdmin
    .from('beds')
    .update({ status: 'occupied', tenant_id: tenantId })
    .eq('id', onboardingData.bed_id);

  const newOccupiedCount = Math.min((room.occupied_beds || 0) + 1, room.total_beds);
  await supabaseAdmin
    .from('rooms')
    .update({
      occupied_beds: newOccupiedCount,
      status: newOccupiedCount >= room.total_beds ? 'occupied' : 'available',
    })
    .eq('id', onboardingData.room_id);

  // 8. Update Tenant Profile
  const metadata = {
    gender: onboardingData.gender,
    date_of_birth: onboardingData.date_of_birth,
    id_proof_type: 'aadhaar',
    id_proof_number: onboardingData.id_proof_number,
    college_name: onboardingData.college_name,
  };

  const { data: updatedTenant, error: updateErr } = await supabaseAdmin
    .from('tenants')
    .update({
      permanent_address: onboardingData.permanent_address,
      emergency_contact_name: onboardingData.emergency_contact_name,
      emergency_contact_phone: onboardingData.emergency_contact_phone,
      room_id: onboardingData.room_id,
      bed_id: onboardingData.bed_id,
      move_in_date: onboardingData.move_in_date,
      notes: JSON.stringify(metadata),
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId)
    .select('*, room:rooms!room_id(room_number, floor), bed:beds!bed_id(bed_number)')
    .single();

  if (updateErr) throw new Error(updateErr.message);

  await logAudit({
    pgId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'COMPLETE_TENANT_ONBOARDING',
    entityType: 'tenant',
    entityId: tenantId,
    details: {
      room_id: onboardingData.room_id,
      bed_id: onboardingData.bed_id,
      aadhaar_file: aadhaarUpload.path,
      college_id_file: collegeUpload.path,
    },
  });

  // Notify PG Admin
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
          title: 'Tenant Onboarding Completed',
          message: `${tenant.full_name} completed onboarding for Room ${room.room_number}, Bed ${bed.bed_number}.`,
          type: 'tenant_onboarding',
          metadata: { tenantId, roomId: onboardingData.room_id, bedId: onboardingData.bed_id },
        });

        if (ownerUser.phone) {
          const moveInFormatted = formatDateDMY(onboardingData.move_in_date);
          const alertMsg = `✅ *Tenant Onboarding Completed — Sagar PG*\n\nTenant: *${tenant.full_name}*\nRoom: *${room.room_number}* | Bed: *${bed.bed_number}*\nMove-in: *${moveInFormatted}*\n\nDocuments (Aadhaar & College ID) are ready for review in Admin Portal.`;
          await sendWhatsAppMessage(ownerUser.phone, alertMsg);
        }
      }
    } catch (e: any) {
      console.warn('[Notification] Failed to alert admin of tenant onboarding:', e.message);
    }
  })();

  return parseTenantMetadata(updatedTenant);
}

