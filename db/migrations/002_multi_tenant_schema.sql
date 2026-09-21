-- ============================================================
-- Migration 002: Multi-Tenant Schema Architecture
-- ============================================================

-- 1. Create PGS table
CREATE TABLE IF NOT EXISTS pgs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(15),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  gmaps_link TEXT,
  description TEXT,
  rules TEXT,
  check_in_info TEXT,
  check_out_info TEXT,
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(15),
  upi_id VARCHAR(100),
  bank_name VARCHAR(100),
  account_number VARCHAR(50),
  ifsc_code VARCHAR(20),
  account_holder_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pgs_owner_id ON pgs(owner_id);

-- 2. Backfill/Create a default PG for existing admin (if any admin exists without a PG)
DO $$
DECLARE
  v_admin_id UUID;
  v_pg_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM admins LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    -- Check if PG already exists for this admin
    SELECT id INTO v_pg_id FROM pgs WHERE owner_id = v_admin_id LIMIT 1;
    IF v_pg_id IS NULL THEN
      INSERT INTO pgs (
        owner_id, name, phone, email, address, city, state, pincode,
        description, rules, check_in_info, check_out_info,
        emergency_contact_name, emergency_contact_phone,
        upi_id, bank_name, account_number, ifsc_code, account_holder_name
      ) VALUES (
        v_admin_id,
        'Sagar PG',
        '9876543200',
        'admin@pg.com',
        '123, 4th Cross, Koramangala 5th Block',
        'Bangalore',
        'Karnataka',
        '560095',
        'Premium student and working professional accommodation with all amenities.',
        '1. Gate closes at 11:00 PM.\n2. Non-resident visitors allowed until 8:00 PM only.\n3. Keep common areas clean.\n4. No smoking or alcohol in premises.',
        'Check-in: 9:00 AM to 7:00 PM with valid Government ID.',
        'Check-out notice: 30 days prior notice required for security deposit return.',
        'Rajesh Sharma',
        '9876543200',
        'pgowner@upi',
        'HDFC Bank',
        '50100234567890',
        'HDFC0001234',
        'Rajesh Sharma'
      ) RETURNING id INTO v_pg_id;
    END IF;
  END IF;
END $$;

-- 3. Add pg_id to all resource tables
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
ALTER TABLE beds ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
ALTER TABLE rent_records ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
ALTER TABLE electricity_bills ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE SET NULL;
ALTER TABLE registration_tokens ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;

-- 4. Backfill existing records with the default PG ID
DO $$
DECLARE
  v_default_pg_id UUID;
BEGIN
  SELECT id INTO v_default_pg_id FROM pgs LIMIT 1;
  IF v_default_pg_id IS NOT NULL THEN
    UPDATE rooms SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE beds SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE tenants SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE rent_records SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE electricity_bills SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE payments SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE complaints SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE assets SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE contacts SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE audit_log SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
    UPDATE registration_tokens SET pg_id = v_default_pg_id WHERE pg_id IS NULL;
  END IF;
END $$;

-- 5. Drop old global UNIQUE constraint on room_number and add composite UNIQUE(pg_id, room_number)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_room_number_key'
  ) THEN
    ALTER TABLE rooms DROP CONSTRAINT rooms_room_number_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_pg_id_room_number_key'
  ) THEN
    ALTER TABLE rooms ADD CONSTRAINT rooms_pg_id_room_number_key UNIQUE (pg_id, room_number);
  END IF;
END $$;

-- 6. Create PROPERTY_SETTINGS table (scoped per PG)
CREATE TABLE IF NOT EXISTS property_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pg_id UUID NOT NULL UNIQUE REFERENCES pgs(id) ON DELETE CASCADE,
  wifi_networks JSONB DEFAULT '[]',
  notice_period_days INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_settings_pg_id ON property_settings(pg_id);

-- 7. Create ANNOUNCEMENTS table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pg_id UUID NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'general' CHECK (category IN ('water', 'electricity', 'maintenance', 'rent', 'general')),
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'archived')),
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL, -- admin user_id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_pg_id ON announcements(pg_id);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);

-- 8. Add indexes on all pg_id columns for rapid data isolation
CREATE INDEX IF NOT EXISTS idx_rooms_pg_id ON rooms(pg_id);
CREATE INDEX IF NOT EXISTS idx_beds_pg_id ON beds(pg_id);
CREATE INDEX IF NOT EXISTS idx_tenants_pg_id ON tenants(pg_id);
CREATE INDEX IF NOT EXISTS idx_rent_records_pg_id ON rent_records(pg_id);
CREATE INDEX IF NOT EXISTS idx_electricity_bills_pg_id ON electricity_bills(pg_id);
CREATE INDEX IF NOT EXISTS idx_payments_pg_id ON payments(pg_id);
CREATE INDEX IF NOT EXISTS idx_complaints_pg_id ON complaints(pg_id);
CREATE INDEX IF NOT EXISTS idx_assets_pg_id ON assets(pg_id);
CREATE INDEX IF NOT EXISTS idx_contacts_pg_id ON contacts(pg_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_pg_id ON audit_log(pg_id);
CREATE INDEX IF NOT EXISTS idx_registration_tokens_pg_id ON registration_tokens(pg_id);
