#!/usr/bin/env bash
set -uo pipefail
# Acceptance tests for issue #94: Drizzle schema, config and baseline migration.
# Criteria (one test each in us94.test.mjs, plus the us-2 regression below):
#  - package.json lists drizzle-orm and drizzle-kit
#  - schema.ts matches the real database (columns, nullability, indexes, FK ON DELETE)
#  - baseline migration is `SELECT 1;`, config/journal/Dockerfile/.dockerignore in place
#  - `npx drizzle-kit generate` reports no schema changes
#  - restart on same PGLITE_DATA_DIR keeps data, /health 200, __drizzle_migrations has one row
#  - in-memory start returns /health 200
#  - us-2's getDb().query('SELECT 1 as one') still passes
# (The unit-test criteria and `make test`/`make build` are checked by CI itself.)
# Container criterion is tested by starting `node build` directly (no Docker in CI).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
export ROOT
cd "$ROOT"
[ -d node_modules ] || npm ci || exit 1
if [ -z "${FORGE_PREBUILT:-}" ]; then npm run build || exit 1; fi
FAILED=0
node --test --test-timeout=240000 tests/acceptance/us-94/us94.test.mjs || FAILED=1
echo "=== us-2 ac5 (getDb query) ==="
bash tests/acceptance/us-2/ac5_db_module_direct_query.sh || FAILED=1
exit "$FAILED"
