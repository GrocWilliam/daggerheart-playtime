CREATE TABLE IF NOT EXISTS items (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	name text NOT NULL,
	quantity integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now()
);
