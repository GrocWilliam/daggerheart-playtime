#!/usr/bin/env bash
# US-334 CSS foundations. Criteria:
# (1) looks.test.mjs "variant classes ...": inserted btn-primary/secondary/ghost/danger buttons and a btn-secondary link: colours, 44×44px, 4px radius (1024×768).
# (2) "a pressed btn-secondary ...": aria-pressed=true looks primary, false keeps secondary.
# (3) "a btn-ghost focused with the keyboard ...": 2px solid teal outline.
# (4) "--border paints ...": canvas pixel of var(--border) is accent at 35% alpha.
# (5) "the sheet useArmor checkbox ...": 20×20, accent-color, label >= 44px at 375×812 and 1024×768.
# (6) "h1 is 24px ... 28px from 768px".
# (7) "buttons with no variant class ...": home and Run step buttons keep accent background and bg text.
# (8) css.test.mjs: app.css < 150 lines, @layer components with four .btn-* rules, no unlayered button background-color, no color-mix( in src.
# (9) all existing acceptance tests pass (us-101 checkbox size updated): run by CI over every tests/acceptance/*/run.sh, not here.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-334"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
node --test "$HERE/css.test.mjs" || FAIL=1
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
if [ $UP -ne 1 ]; then echo "server did not start" >&2; cat "$LOG"; exit 1; fi
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/looks.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
