---
name: db-migration
description: Change the database schema of daggerheart-playtime - new table, column, index or constraint, or a data fix. Use whenever a story needs to store something new or change how rows are stored.
---

# Database migration

- Add `migrations/NNN_short_name.sql` with the next number (look at `ls migrations`). Never edit, rename or renumber
  an existing file: deployed databases already applied it, and `schema_migrations` records it by file name.
- `migrate.ts` runs each file at startup as one multi-statement query, in one implicit transaction with its record:
  a failing migration leaves nothing behind. Do not add `BEGIN`/`COMMIT`.
- The same SQL runs on PGlite (dev, tests) and Postgres (`DATABASE_URL`): plain PostgreSQL, no extensions.
- Write it re-runnable: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- A new column on an existing table needs a `DEFAULT` (or is nullable): rows already exist.
- Follow the existing schema: `id text PRIMARY KEY DEFAULT gen_random_uuid()::text`, `created_at timestamptz NOT NULL
  DEFAULT now()`, foreign keys `REFERENCES parent(id) ON DELETE CASCADE`. Case-insensitive uniqueness is a unique
  index on `lower(btrim(name))` (see `005_items_unique_name.sql`).
- Then update the code that reads the table: the column list constants and the JSON mapper in `src/lib/server/`.

## Check

```sh
make test   # migrate.test.ts and the domain tests run against PGlite
PORT=8080 PGLITE_DATA_DIR=memory:// node build   # after make build: the app must start and answer /health
```

A migration that fails at startup makes `/health` fail: the forge then reverts the deployment.
