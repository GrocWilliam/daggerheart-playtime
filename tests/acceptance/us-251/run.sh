#!/usr/bin/env bash
# Criteria (US-251), tests in tunnel.unit.ts (vitest) and tunnel.test.mjs (Node test runner + Playwright against `node build`, in-memory PGlite):
# (1) firstInvalid({name,class:'Pirate',level:'1'}, 2) -> { step: 1, field: 'class' }; class 'Warrior' does not stop at step 1: tunnel.unit.ts
# (2) GET ?step=2&class=Pirate -> 303 to step=1&invalid=class; the page shows a [role=alert] (en, fr): tunnel.test.mjs
# (3) GET ?step=2&class=Warrior -> 200 on step 2: tunnel.test.mjs
# (4) POST /api/campaigns/:id/characters with class "Pirate" -> 201: tunnel.test.mjs
# (5) make test passes: run by CI itself (not repeated here).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-251"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/tunnel.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
