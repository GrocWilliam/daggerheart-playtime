#!/usr/bin/env bash
# US-191 criteria (tests in tablet.test.mjs, one per criterion; 4 viewports on /, /reference, /characters/:id):
# no sideways scroll; controls >= 44x44; text inputs 16px; controls visible with the pointer never moved;
# header on one row from 768; home grid 1/2/3 columns; sheet-sections grid; reference 2 columns from 768.
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-191"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" PLAYWRIGHT_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/tablet.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $RC
