#!/usr/bin/env bash
# Criteria (US-197), all in tunnel.test.mjs (Node test runner + Playwright against `node build`, in-memory PGlite):
# (1) Build step: new-character link (en/fr text, href), no input[name=maxHp]
# (2) /new and ?step=9 show step 1: progress text, 4 step names, aria-current=step (en/fr)
# (3) /campaigns/unknown/characters/new -> 404 with the +error.svelte page
# (4) no-JS walk: step 1 -> 2 (URL, progress), 2 -> 3 -> 4 (summary), Create -> /characters/:newId
# (5) tunnel-back on step 3, tunnel-edit-1 on step 4, tunnel-cancel on step 1
# (6) required/min/max on each step's inputs (and defaults level 1, maxStress 6)
# (7) ?step=3&level=11 -> 303 step=1&invalid=level, alert with the label, level prefilled (boundary: level=10 is fine)
# (8) ?step=4 with major 10 / severe 5 -> step=3&invalid=severeThreshold, alert
# (9) POST with maxHp=99 -> 303 step=3&invalid=maxHp, alert
# (10) with JS: Next/Back keep window.__marker; (11) with JS: Create lands on the sheet
# (12) en/fr texts of Next, Back, Cancel, Edit, Create
# (13) layout rules at 375x812, 768x1024, 1024x768, 1180x820 on steps 1-4
# (14) POST ?/addCharacter still creates a character
# (15) make test: vitest run below; other acceptance tests are run by CI
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-197"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
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
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/tunnel.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
