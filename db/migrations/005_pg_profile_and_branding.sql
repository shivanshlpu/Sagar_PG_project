-- Migration 005: PG Profile and Branding Extensions
-- Adds owner_name, tagline, and logo_url to pgs table for professional invoices and multi-PG isolation

ALTER TABLE pgs
ADD COLUMN IF NOT EXISTS owner_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS tagline VARCHAR(200) DEFAULT 'PREMIUM PG LIVING',
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Backfill owner_name from admins table where available and currently null
UPDATE pgs
SET owner_name = admins.full_name
FROM admins
WHERE pgs.owner_id = admins.id
  AND (pgs.owner_name IS NULL OR pgs.owner_name = '');

-- Fallback backfill: if owner_name still null, attempt matching admins by pg_id
UPDATE pgs
SET owner_name = admins.full_name
FROM admins
WHERE pgs.id = admins.pg_id
  AND (pgs.owner_name IS NULL OR pgs.owner_name = '');

COMMENT ON COLUMN pgs.owner_name IS 'Full legal or business name of the PG owner / administrator';
COMMENT ON COLUMN pgs.tagline IS 'Branding tagline displayed beneath logo/title on invoices and tenant portal';
COMMENT ON COLUMN pgs.logo_url IS 'Base64 data URL or storage URL of the PG logo for invoices and branding';
