#!/usr/bin/env bash
# Criteria (US-305), tests in tabs.test.mjs, one per criterion: missing/unknown tab -> play; each tab key shows only its
# sections with one bold underlined aria-current tab; tab hrefs and no-JS tab-gear link; header above sheet-tabs on every tab;
# new-edit params carry the tab; ?new=item&tab=gear opens modal-item with cancel params tab=gear; sheet-panel surface look;
# 768x1024 per-tab grids; 375x812 one left x and no scroll; French tab labels.
# The "all acceptance scripts and make test pass" criterion is enforced by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-305"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test --test-timeout=300000 "$HERE/tabs.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
