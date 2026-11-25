#!/usr/bin/env bash
# Criteria (damage.test.mjs, damage-body.test.mjs): damageBody; Run and sheet damage actions with quick (Major, armor,
# quick over amount, Severe, 303 without JS); en/fr labels; JS and no-JS taps; required blocking only Apply; look and
# 44px; 500px card and 375px scroll; docs/ui.md test ids and budget.
# Also updated: us-339 (card budget 500), us-342 (damage form check ignores name=quick buttons).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-387"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 120); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/damage.test.mjs" "$HERE/damage-body.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
