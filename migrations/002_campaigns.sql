CREATE TABLE IF NOT EXISTS campaigns (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	name text NOT NULL,
	fear integer NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	seq bigserial
);
