export type UserRole = 'admin' | 'tenant';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  pgId: string; // Associated PG ID for strict data isolation
  pgName?: string; // Associated PG Name for dynamic branding
  adminId?: string; // Admin record ID
  tenantId?: string; // Only set for tenant role
}

export interface PG {
  id: string;
  owner_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gmaps_link?: string | null;
  description?: string | null;
  rules?: string | null;
  check_in_info?: string | null;
  check_out_info?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  upi_id?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  account_holder_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  pg_id?: string;
  room_number: string;
  floor: number;
  room_type: 'single' | 'double' | 'triple' | 'dormitory';
  total_beds: number;
  occupied_beds: number;
  base_rent_paise: number; // Currency in paise, formatted to INR only at presentation layer
  status: 'available' | 'full' | 'maintenance';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bed {
  id: string;
  pg_id?: string;
  room_id: string;
  bed_number: string;
  status: 'vacant' | 'occupied' | 'reserved' | 'maintenance';
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  pg_id?: string;
  user_id: string; // References Supabase Auth user
  full_name: string;
  phone: string;
  email: string;
  gender?: 'male' | 'female' | 'other' | null;
  date_of_birth?: string | null;
  id_type?: string | null;
  id_number?: string | null;
  id_document_path?: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  permanent_address: string | null;
  room_id: string | null;
  bed_id: string | null;
  move_in_date: string | null;
  move_out_date: string | null;
  expected_leaving_date?: string | null;
  security_deposit_paise: number;
  status: 'active' | 'inactive' | 'moved_out' | 'pending';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentRecord {
  id: string;
  pg_id?: string;
  tenant_id: string;
  room_id: string;
  month: string; // YYYY-MM
  rent_amount_paise: number;
  late_fee_paise: number;
  total_due_paise: number;
  status: 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'waived';
  due_date: string;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ElectricityBill {
  id: string;
  pg_id?: string;
  tenant_id: string;
  room_id: string;
  month: string;
  previous_reading: number;
  current_reading: number;
  units_consumed: number;
  rate_per_unit_paise: number;
  total_amount_paise: number;
  status: 'pending' | 'paid' | 'included_in_rent';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  pg_id?: string;
  tenant_id: string;
  rent_record_id: string | null;
  electricity_bill_id: string | null;
  amount_paise: number;
  payment_method: 'cash' | 'upi' | 'bank_transfer' | 'card' | 'other';
  screenshot_path: string | null;
  status: 'submitted' | 'verified' | 'rejected';
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Complaint {
  id: string;
  pg_id?: string;
  tenant_id: string;
  room_id: string | null;
  category: 'maintenance' | 'noise' | 'cleanliness' | 'security' | 'billing' | 'other';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assigned_to: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplaintComment {
  id: string;
  complaint_id: string;
  author_id: string;
  author_role: UserRole;
  content: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  pg_id: string;
  title: string;
  description: string;
  category: 'water' | 'electricity' | 'maintenance' | 'rent' | 'general';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'active' | 'expired' | 'archived';
  expires_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  pg_id?: string;
  room_id: string;
  name: string;
  description: string | null;
  quantity: number;
  condition: 'good' | 'fair' | 'poor' | 'damaged' | 'replaced';
  photo_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  pg_id?: string;
  user_id: string;
  title: string;
  message: string;
  type: 'rent_due' | 'payment_verified' | 'payment_rejected' | 'complaint_update' | 'announcement' | 'move_in' | 'move_out' | 'general';
  is_read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  pg_id?: string;
  actor_id: string;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  pg_id?: string;
  name: string;
  role: string;
  phone: string;
  email: string | null;
  is_emergency: boolean;
  created_at: string;
  updated_at: string;
}

export interface PGSettings {
  id: string;
  pg_id: string;
  key: string;
  value: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WifiSettings {
  network_name: string;
  password: string;
  notes: string | null;
  updated_at: string;
}

export interface ReminderSettings {
  rent_reminder_day: number; // Day of month to send rent reminder
  rent_due_day: number; // Day of month rent is due
  late_fee_grace_days: number;
  late_fee_paise: number;
  electricity_reminder_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// API response wrappers
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
