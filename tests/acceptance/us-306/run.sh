#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-306), one test each in sheet-tab-posts.test.mjs:
# (1) gear tab: gold/equip/modal-item form actions carry &tab=gear; (2) play tab: tracker/damage/condition actions carry &tab=play;
# (3) traits tab + ?new=edit: edit form posts to ?/edit&tab=traits;
# (4-6) no JS: gold=7, addItem, and edit modal from ?tab=cards end on ?tab=<same> (search params exactly tab=...);
# (7-8) a 400 on gold / notes renders its tab with exactly one [role=alert] inside sheet-gold / sheet-notes, error.invalid text (en/fr);
# (9) with JS, HP + keeps search at tab=play (or empty) and updates hp in place.
# The all-scripts / make test criterion is checked by CI itself.
# Starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-306"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 120); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/sheet-tab-posts.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
