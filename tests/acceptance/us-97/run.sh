#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-97), tests in items-drizzle.test.mjs:
# (1) no getDb use in src/**/*.ts outside db.ts and tests; no SQL/db.query left in src/routes nor ITEMS_SUBQUERY;
# (2) unit tests cover item create, duplicate name, quantity update, delete, cascade (vitest);
# (3) item endpoints keep their responses (live server, in-memory PGlite, no Docker);
# (4) drizzle-kit generate reports no changes; (5) CLAUDE.md no longer describes raw query / migrations/NNN as schema path.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-97"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test "$HERE/items-drizzle.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
