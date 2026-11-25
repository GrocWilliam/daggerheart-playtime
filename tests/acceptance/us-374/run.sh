#!/usr/bin/env bash
# US-374 Left-align the header nav on phones. Criteria (header-left.test.mjs):
# (1) 375px: nav-home within 16px after sigil, nav-reference within 16px after nav-home (4 pages, en+fr);
# (2) 375px: switcher at right end, header <= 60px, no sideways scroll (375 and 360);
# (3) 375px: nav-home >= 44x44, name "Daggerheart Playtime";
# (4) 768/1024/1180: left edges equal those recorded on main 99e1db4 (within 1px).
# (5) 375px: the header has no justify-content: space-between.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-374"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
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
if [ $UP -ne 1 ]; then echo "server did not start" >&2; cat "$LOG"; exit 1; fi
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/header-left.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $RC
