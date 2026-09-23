-- ============================================================
-- Migration 003: Multi-PG Account Isolation & OTP Routing
-- ============================================================

-- 1. Create OTP_REQUESTS table for persistent, PG-scoped OTP audit trail
CREATE TABLE IF NOT EXISTS otp_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  pg_id UUID NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'password_reset',
  otp_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_requests_user_pg ON otp_requests(user_id, pg_id);
CREATE INDEX IF NOT EXISTS idx_otp_requests_phone_pg ON otp_requests(phone, pg_id);
CREATE INDEX IF NOT EXISTS idx_otp_requests_expires_at ON otp_requests(expires_at);

-- 2. Add pg_id to notifications table for full tenant isolation
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS pg_id UUID REFERENCES pgs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_pg_id ON notifications(pg_id);

-- 3. Backfill notifications with tenant's or admin's pg_id if null
DO $$
BEGIN
  -- Backfill tenant notifications
  UPDATE notifications n
  SET pg_id = t.pg_id
  FROM tenants t
  WHERE n.user_id = t.user_id AND n.pg_id IS NULL AND t.pg_id IS NOT NULL;

  -- Backfill admin notifications
  UPDATE notifications n
  SET pg_id = p.id
  FROM admins a
  JOIN pgs p ON p.owner_id = a.id
  WHERE n.user_id = a.user_id AND n.pg_id IS NULL;
END $$;
