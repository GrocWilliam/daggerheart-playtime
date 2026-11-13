#!/usr/bin/env bash
# Criteria, all in steps.test.mjs (Node test runner + Playwright against `node build`, in-memory PGlite):
# step bars (tunnel 4 viewports en/fr, level-up), button variants and 44px/8px layout, trait select width,
# step 4 and step 5 buttons, no-JS Create, no sideways scroll at 360/375.
# "Every existing acceptance test passes" is enforced by CI, which runs every tests/acceptance/*/run.sh.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-344"
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
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/steps.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $RC
