#!/usr/bin/env bash
# Criteria (US-100), tests in campaign.test.mjs, one per criterion:
# (1) computed styles unchanged on the campaign page and Pips at 375/700/1280: colours, borders, 44px targets, party grid columns,
#     add-character form 2 columns at 1280 and 1 at 375, pip shapes and colours, no horizontal scroll;
# (2) campaign page and Pips have no <style>/style=, no old classes (party, tracker, form-grid, stats), no arbitrary/default-palette colours,
#     data-testids kept; app.css has no .party rule;
# (3) the us-38 colour scan passes;
# (4) make test / make build / other acceptance scripts are run by CI (not repeated here); us-98 .party check is updated separately.
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-100"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/campaign.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
