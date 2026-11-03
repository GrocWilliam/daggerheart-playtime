#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-77): both forms (?/addCharacter on campaign page, ?/edit on character page) have class form-grid;
# 1280x800: 2 columns (1st/2nd label same top, different left); 375x667: 1 column (each label top >= previous
# bottom, no sideways scroll); submit button after all labels in DOM and its left == form content-box left (±1px);
# controls keep S2 rules (below label text, fill width at 375, <=384 at 1280, textarea fills form); en and fr.
# Existing acceptance scripts are run by CI separately.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-77"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
OK=0
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && { OK=1; break; }
  sleep 0.5
done
[ $OK = 1 ] || { echo "server did not start" >&2; cat "$LOG"; exit 1; }
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/grid.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
