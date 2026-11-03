#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-95), tests in campaigns-drizzle.test.mjs:
# (1) campaigns.ts has no raw SQL keywords outside sql templates; campaign handlers do not use db.query;
# (2) campaigns.test.ts passes (vitest, PGlite) and covers list, create, read, fear clamp 0/12, delete;
# (3) all campaign endpoints return the same JSON (shapes, order, statuses);
# (4) make test / build / other scripts run in CI. Starts `node build` on a free port, in-memory PGlite (no Docker).
# Starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-95"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test "$HERE/campaigns-drizzle.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
