#!/usr/bin/env bash
# Criteria (US-282):
# (1) created characters (any level) answer proficiency 1, advancements [], markedTraits []: api.test.mjs
# (2) PATCH cannot write the three fields: api.test.mjs
# (3) backfill of levels 1,2,5,8,10 -> proficiency 1,2,3,4,4: migration.test.mjs
# (4) drizzle/0006_level_up.sql has the UPDATE; drizzle-kit generate reports no changes: migration.test.mjs
# (5) subclassStage: stage.unit.ts
# (6) make test and the other acceptance tests pass (run by CI)
# Starts `node build` on a free port with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-282"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
ROOT="$ROOT" node --test "$HERE/migration.test.mjs" || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/api.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -20 "$LOG"; }
exit $FAIL
