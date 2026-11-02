ALTER TABLE characters ADD COLUMN IF NOT EXISTS subclass text;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS ancestry text;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS community text;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS cards jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE items ADD COLUMN IF NOT EXISTS srd_id text;
