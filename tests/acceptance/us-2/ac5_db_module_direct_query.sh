#!/usr/bin/env bash
set -uo pipefail

# AC: "A unit test (run by npm test) can call the db module directly with
# PGLITE_DATA_DIR=memory://, run SELECT 1 as one, and observe
# rows[0].one === 1, without any external process."
#
# We exercise the actual function interface (src/lib/server/db.ts's getDb())
# directly, via `tsx`, rather than trusting a unit test the dev wrote.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

OUTPUT="$(unset DATABASE_URL PORT; export PGLITE_DATA_DIR="memory://"; npx --yes tsx@4 "$SCRIPT_DIR/ac5_db_module_direct_query.ts" 2>&1)"
STATUS=$?

echo "$OUTPUT"

if [ "$STATUS" -ne 0 ]; then
  echo "AC5 failed: script exited $STATUS" >&2
  exit 1
fi

if ! echo "$OUTPUT" | grep -q "AC5_OK"; then
  echo "AC5 failed: expected confirmation not found in output" >&2
  exit 1
fi

echo "AC5 passed: getDb().query('SELECT 1 as one') returned rows[0].one === 1 in memory mode"
