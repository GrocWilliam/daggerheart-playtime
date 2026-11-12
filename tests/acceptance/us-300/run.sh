#!/usr/bin/env bash
# Criteria (US-300), tests in forms.test.mjs, one per criterion:
# (1) forms outside dialogs are unboxed (transparent bg, no border, 0 padding, 12px margin-bottom) on sheet, run, build;
# (2) app.css has a form rule whose only declaration is margin-bottom: 0.75rem, and < 150 lines;
# (3) character-card, encounter-adversary, loot-entry keep the 3px double border and a surface background;
# (4) modal-campaign panel keeps the surface background;
# (5) h2 outside dialogs on sheet and DM screen: margin-top 16px, margin-bottom 8px;
# (6) no src file contains `rounded-none!`;
# (7) exactly one divider on the sheet, right after the h1;
# (8) no horizontal scroll and 44x44 targets at 375x812 and 1024x768 on sheet and both DM steps.
# The "all acceptance scripts and make test pass" criterion is enforced by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-300"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test --test-timeout=300000 "$HERE/forms.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
