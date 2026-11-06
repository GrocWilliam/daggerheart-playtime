#!/usr/bin/env bash
# Criteria (US-196):
# (1) createFields/createSchema/thresholdsOk/THRESHOLDS_ERROR exports and messages: tunnel.unit.ts
# (2) pickOptions (ancestries fr, classes en, order): tunnel.unit.ts
# (3) tunnel.ts helpers (TUNNEL_STEPS, parseStep, readValues, firstInvalid, stepOfField, fieldOfMessage, tunnelHref): tunnel.unit.ts
# (4) DM screen selects unchanged (en/fr), now read on the us-197 tunnel steps 1-2: page.test.mjs against `node build` with in-memory PGlite
# (5) make test passes (vitest) and other acceptance tests pass (run by CI)
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-196"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/page.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -20 "$LOG"; }
exit $FAIL
