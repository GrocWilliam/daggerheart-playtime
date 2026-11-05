#!/usr/bin/env bash
# Criteria (US-129), one test each:
# (1) srd.ts helpers: tier filtering, grouping, French names ...... helpers.unit.ts
# (2) level 1: no tier 2+, None first; level 2: tier groups ....... equipment.test.mjs (levels 1, 2, 5)
# (3) choose weapon -> details in testid; None clears ............. equipment.test.mjs
# (4) armor -> Armor max / thresholds from API, equipped-armor .... equipment.test.mjs
# (5) two-handed primary: no secondary select, note; one-handed ... equipment.test.mjs
# (6) French labels and details; 400 shows a translated error ..... equipment.test.mjs
# (7) i18n and hardcoded-text tests pass .......................... below
# Starts `node build` on a free port with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-129"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run src/lib/i18n/hardcoded.test.ts src/lib/i18n/i18n.test.ts || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/equipment.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $FAIL
