import { z } from 'zod';

// -- Auth Schemas --
export const registerSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'tenant']),
  full_name: z.string().min(1, 'Name is required').max(200),
  phone: z.string().min(10, 'Valid phone number required').max(15).nullish().or(z.literal('')),
  pg_name: z.string().max(200).nullish().or(z.literal('')),
  pg_code: z.string().max(50).nullish().or(z.literal('')),
  pg_id: z.string().uuid().nullish().or(z.literal('')),
}).strict().refine((data) => {
  if (data.role === 'tenant') {
    const hasCode = !!(data.pg_code && data.pg_code.trim());
    const hasId = !!(data.pg_id && data.pg_id.trim());
    return hasCode || hasId;
  }
  return true;
}, {
  message: 'Please provide a valid PG Code or select your PG property to register as a tenant.',
  path: ['pg_code'],
});

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
}).strict();

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email required'),
}).strict();

export const verifyOtpSchema = z.object({
  email: z.string().email('Valid email required'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
}).strict();

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
}).strict();

// -- PG Schemas --
export const updatePGSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(15).nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  pincode: z.string().max(10).nullable().optional(),
  gmaps_link: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  rules: z.string().nullable().optional(),
  check_in_info: z.string().nullable().optional(),
  check_out_info: z.string().nullable().optional(),
  emergency_contact_name: z.string().max(200).nullable().optional(),
  emergency_contact_phone: z.string().max(15).nullable().optional(),
  upi_id: z.string().max(100).nullable().optional(),
  bank_name: z.string().max(100).nullable().optional(),
  account_number: z.string().max(50).nullable().optional(),
  ifsc_code: z.string().max(20).nullable().optional(),
  account_holder_name: z.string().max(200).nullable().optional(),
}).strict();

// -- Announcement Schemas --
export const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(3000),
  category: z.enum(['water', 'electricity', 'maintenance', 'rent', 'general']).default('general'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  expires_at: z.string().datetime().nullable().optional(),
}).strict();

export const updateAnnouncementSchema = createAnnouncementSchema.partial().extend({
  status: z.enum(['active', 'expired', 'archived']).optional(),
}).strict();

// -- Room Schemas --
export const createRoomSchema = z.object({
  room_number: z.string().min(1, 'Room number is required').max(20),
  floor: z.number().int().min(0, 'Floor must be 0 or higher'),
  room_type: z.enum(['single', 'double', 'triple', 'dormitory']),
  total_beds: z.number().int().min(1, 'Must have at least 1 bed'),
  base_rent_paise: z.number().int().min(0, 'Rent must be non-negative'),
  notes: z.string().max(500).nullable().optional(),
}).strict();

export const updateRoomSchema = createRoomSchema.partial().strict();

export const assignBedSchema = z.object({
  tenant_id: z.string().uuid().nullable(),
  status: z.enum(['vacant', 'occupied', 'reserved', 'maintenance']).optional(),
}).strict();

// -- Tenant Schemas --
// -- Tenant Schemas --
export const createTenantSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(200),
  phone: z.string().min(10).max(20),
  email: z.string().email(),
  gender: z.union([z.enum(['male', 'female', 'other']), z.string(), z.literal(''), z.null()]).optional(),
  date_of_birth: z.union([z.string(), z.literal(''), z.null()]).optional(),
  id_type: z.string().max(50).nullable().optional(),
  id_number: z.string().max(100).nullable().optional(),
  id_proof_type: z.string().max(50).nullable().optional(),
  id_proof_number: z.string().max(100).nullable().optional(),
  college_name: z.string().max(200).nullable().optional(),
  emergency_contact_name: z.string().max(200).nullable().optional(),
  emergency_contact_phone: z.string().max(20).nullable().optional(),
  permanent_address: z.string().max(500).nullable().optional(),
  room_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  bed_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  move_in_date: z.union([z.string(), z.literal(''), z.null()]).optional(),
  security_deposit: z.coerce.number().min(0).optional(),
  security_deposit_paise: z.number().int().min(0).optional().default(0),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(['active', 'notice_given', 'moved_out', 'suspended']).optional(),
}).passthrough();

export const updateTenantSchema = createTenantSchema.partial().passthrough();

// -- Rent Schemas --
export const generateRentSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM format'),
  tenant_ids: z.array(z.string().uuid()).optional(), // If empty, generates for all active tenants
  due_date: z.string().datetime().optional(),
}).strict();

export const updateRentSchema = z.object({
  status: z.enum(['pending', 'paid', 'partially_paid', 'overdue', 'waived']).optional(),
  late_fee_paise: z.number().int().min(0).optional(),
  notes: z.string().max(1000).nullable().optional(),
}).strict();

// -- Electricity Schemas --
export const createElectricityBillSchema = z.object({
  tenant_id: z.string().uuid(),
  room_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM format'),
  previous_reading: z.number().min(0),
  current_reading: z.number().min(0),
  rate_per_unit_paise: z.number().int().min(0).optional(),
  notes: z.string().max(1000).nullable().optional(),
}).strict().refine(
  (data) => data.current_reading >= data.previous_reading,
  { message: 'Current reading must be greater than or equal to previous reading', path: ['current_reading'] }
);

export const updateElectricityBillSchema = z.object({
  status: z.enum(['pending', 'paid', 'included_in_rent']).optional(),
  notes: z.string().max(1000).nullable().optional(),
}).strict();

// -- Payment Schemas --
export const submitPaymentSchema = z.object({
  rent_record_id: z.string().uuid().nullable().optional(),
  electricity_bill_id: z.string().uuid().nullable().optional(),
  amount_paise: z.number().int().min(1, 'Amount must be positive'),
  payment_method: z.enum(['cash', 'upi', 'bank_transfer', 'card', 'other']),
  notes: z.string().max(1000).nullable().optional(),
  utr_id: z.string().max(100).nullable().optional(),
  reference_id: z.string().max(100).nullable().optional(),
}).strict();

export const verifyPaymentSchema = z.object({
  status: z.enum(['verified', 'rejected']),
  rejection_reason: z.string().max(500).nullable().optional(),
}).strict();

// -- Complaint Schemas --
export const createComplaintSchema = z.object({
  room_id: z.string().uuid().nullable().optional(),
  category: z.enum(['maintenance', 'noise', 'cleanliness', 'security', 'billing', 'other']),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
}).strict();

export const updateComplaintSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  assigned_to: z.string().max(200).nullable().optional(),
  resolution_note: z.string().max(2000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
}).strict();

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(2000),
}).strict();

// -- Asset Schemas --
export const createAssetSchema = z.object({
  room_id: z.string().uuid('Valid room ID is required'),
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(500).nullable().optional(),
  quantity: z.number().int().min(1).default(1),
  condition: z.enum(['good', 'fair', 'poor', 'damaged', 'replaced']).default('good'),
  notes: z.string().max(1000).nullable().optional(),
}).strict();

export const updateAssetSchema = createAssetSchema.partial().strict();

// -- Move In/Out Schemas --
export const moveInSchema = z.object({
  room_id: z.string().uuid(),
  bed_id: z.string().uuid(),
  move_in_date: z.string().datetime(),
  security_deposit_paise: z.number().int().min(0).optional(),
  notes: z.string().max(1000).nullable().optional(),
}).strict();

export const moveOutSchema = z.object({
  move_out_date: z.string().datetime(),
  notes: z.string().max(1000).nullable().optional(),
}).strict();

// -- Settings Schemas --
export const wifiNetworkItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Network name is required').max(100),
  password: z.string().min(1, 'Password is required').max(100),
  floor: z.string().max(50).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const updateWifiSchema = z.object({
  networks: z.array(wifiNetworkItemSchema).optional(),
  network_name: z.string().max(100).optional(),
  password: z.string().max(100).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const updateRemindersSchema = z.object({
  rent_reminder_day: z.number().int().min(1).max(28),
  rent_due_day: z.number().int().min(1).max(28),
  late_fee_grace_days: z.number().int().min(0).max(30),
  late_fee_paise: z.number().int().min(0),
  electricity_reminder_enabled: z.boolean(),
}).strict();

// -- Banking Schemas --
export const updateBankingSchema = z.object({
  upi_id: z.string().max(100).nullable().optional(),
  bank_name: z.string().max(100).nullable().optional(),
  account_number: z.string().max(50).nullable().optional(),
  ifsc_code: z.string().max(20).nullable().optional(),
  account_holder_name: z.string().max(200).nullable().optional(),
  payment_qr: z.string().nullable().optional(),
}).strict();

// -- Contact Schemas --
export const createContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  role: z.string().min(1, 'Role is required').max(100),
  phone: z.string().min(10).max(15),
  email: z.string().email().nullable().optional(),
  is_emergency: z.boolean().default(false),
}).strict();

export const updateContactSchema = createContactSchema.partial().strict();

// -- Query Schemas --
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const rentQuerySchema = paginationSchema.extend({
  month: z.string().optional(),
  room_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'paid', 'partially_paid', 'overdue', 'waived']).optional(),
});

export const reportQuerySchema = z.object({
  range: z.string().optional(), // e.g. "2024-01:2024-06"
  room_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  format: z.enum(['json', 'pdf', 'csv']).default('json'),
});
