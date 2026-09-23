-- ============================================================
-- Migration 004: Multi-PG Property Codes & Strict Tenant Routing
-- ============================================================

-- 1. Add code and status columns to pgs table
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS code VARCHAR(30) UNIQUE;
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived'));

CREATE INDEX IF NOT EXISTS idx_pgs_code ON pgs(code);
CREATE INDEX IF NOT EXISTS idx_pgs_status ON pgs(status);

-- 2. Backfill existing PGs with unique, human-readable codes if null
DO $$
DECLARE
  r RECORD;
  v_prefix TEXT;
  v_seq INT := 101;
  v_candidate TEXT;
BEGIN
  FOR r IN SELECT id, name FROM pgs WHERE code IS NULL OR code = '' ORDER BY created_at ASC LOOP
    -- Extract 3-4 alphanumeric characters from PG name (e.g., 'Sagar PG' -> 'SAG')
    v_prefix := UPPER(REGEXP_REPLACE(r.name, '[^a-zA-Z0-9]', '', 'g'));
    IF LENGTH(v_prefix) < 3 THEN
      v_prefix := 'PG';
    ELSE
      v_prefix := SUBSTRING(v_prefix FROM 1 FOR 3);
    END IF;

    v_candidate := v_prefix || '-' || v_seq;
    WHILE EXISTS (SELECT 1 FROM pgs WHERE code = v_candidate) LOOP
      v_seq := v_seq + 1;
      v_candidate := v_prefix || '-' || v_seq;
    END LOOP;

    UPDATE pgs SET code = v_candidate WHERE id = r.id;
    v_seq := v_seq + 1;
  END LOOP;
END $$;

-- 3. Trigger function to auto-generate unique code for newly created PGs if not provided
CREATE OR REPLACE FUNCTION generate_pg_code()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_code TEXT;
  v_rand INT;
  v_exists BOOLEAN := TRUE;
BEGIN
  IF NEW.code IS NULL OR TRIM(NEW.code) = '' THEN
    v_prefix := UPPER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]', '', 'g'));
    IF LENGTH(v_prefix) < 3 THEN
      v_prefix := 'PG';
    ELSE
      v_prefix := SUBSTRING(v_prefix FROM 1 FOR 3);
    END IF;

    WHILE v_exists LOOP
      v_rand := FLOOR(1000 + RANDOM() * 9000);
      v_code := v_prefix || '-' || v_rand;
      SELECT EXISTS (SELECT 1 FROM pgs WHERE code = v_code) INTO v_exists;
    END LOOP;

    NEW.code := v_code;
  ELSE
    NEW.code := UPPER(TRIM(NEW.code));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_pg_code ON pgs;
CREATE TRIGGER trg_generate_pg_code
BEFORE INSERT ON pgs
FOR EACH ROW
EXECUTE FUNCTION generate_pg_code();
