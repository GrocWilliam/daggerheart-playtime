---
name: db-migration
description: Change the database schema of daggerheart-playtime - new table, column, index or constraint, or a data fix. Use whenever a story needs to store something new or change how rows are stored.
---

# Database migration

Legacy `migrations/*.sql` (run by `migrate.ts`) is **frozen**: never add, edit or rename a file there. New schema
changes go through Drizzle:

1. Edit `src/lib/server/schema.ts` (the Drizzle schema; it mirrors `migrations/001`-`006` for the old tables).
2. Run `npx drizzle-kit generate --name short_name`: it writes `drizzle/NNNN_short_name.sql` and updates
   `drizzle/meta/`. Commit all of it. Never edit an applied file; `drizzle/0000_baseline.sql` is `SELECT 1;`.
3. `getDb()` applies legacy migrations, then Drizzle's migrator on `drizzle/` (path from `process.cwd()`), at startup.
   `getDrizzle()` returns the typed Drizzle instance on the same connection.
4. A new column on an existing table needs a default (or is nullable). Update the column lists/mappers in
   `src/lib/server/`. `npx drizzle-kit generate` must then say "No schema changes".

## Check

```sh
make test   # migrate.test.ts and the domain tests run against PGlite
PORT=8080 PGLITE_DATA_DIR=memory:// node build   # after make build: the app must start and answer /health
```

A migration that fails at startup makes `/health` fail: the forge then reverts the deployment.
