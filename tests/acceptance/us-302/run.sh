#!/usr/bin/env bash
# Criteria (US-302), tests in rows.test.mjs, one per criterion:
# (1) 1024x768 sheet: gold input and button bottoms within 4px, button right of input;
# (2) 1024x768: each equip select (primary, secondary, armor) and its button bottoms within 4px;
# (3) 1024x768: experience value form and quantity form input/button bottoms within 4px;
# (4) 768x1024 run step: journal textarea/button same row (tops or bottoms within 4px), textarea wider;
# (5) 375x812: no horizontal scroll, buttons of these forms >= 44x44;
# (6) these forms are display:flex and flex-wrap:wrap;
# (7) gold 12 and equipping armor work with and without JavaScript.
# The "all acceptance scripts and make test pass" criterion is enforced by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-302"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
UP=0
for _ in $(seq 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && { UP=1; break; }
  sleep 0.5
done
[ $UP = 1 ] || { echo "server did not start"; cat "$LOG"; exit 1; }
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test --test-timeout=300000 "$HERE/rows.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
