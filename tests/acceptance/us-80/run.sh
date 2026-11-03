#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-80), one test each in inventory-style.test.mjs:
# (1) table width equals container width, border-collapse: collapse;
# (2) th colour --muted, left aligned, 1px solid --accent bottom border; tbody tr 1px solid --muted bottom border;
#     th/td padding >= 8px; text contrast >= 4.5;
# (3) at 1280x800 the 3 tds of a row share the same top (+-1px);
# (4) at 375x667 rows are stacked cards: thead visually hidden but 3 columnheaders found, td display block,
#     table scrollWidth <= clientWidth, no page sideways scroll (100-char item name);
# (5) en and fr: 44px targets and 16px text hold.
# Starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-80"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/inventory-style.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
