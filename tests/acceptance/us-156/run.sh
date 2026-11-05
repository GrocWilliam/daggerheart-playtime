#!/usr/bin/env bash
# Criteria: 1 invariants over all party sizes/tiers/adjustment combos/seeds 1-20 (API);
# 2 same seed -> same adversaries, GET scenes shows stored encounter, defaults from characters;
# 3 PATCH over/within/unknown id (400 exact), DELETE -> null (204), unknown scene/campaign 404;
# 4 invalid partySize/tier/adjustments -> 400 naming the field;
# 5 vitest unit tests (generator invariants without a database) are written by dev in
#   src/lib/server/features/encounters.test.ts; this script runs that file.
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-156"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run src/lib/server/features/encounters.test.ts || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/encounter.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
