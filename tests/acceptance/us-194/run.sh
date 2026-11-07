#!/usr/bin/env bash
# US-194: New scene modal on the DM screen Build step.
# Tests (scene-modal.test.mjs, Node test runner + Playwright against `node build` with in-memory PGlite), one per criterion:
# opener link text/href (en, fr) and no title input visible; no-JS open dialog + aria-labelledby h2;
# no-JS submit lands on ?step=build with the scene; JS open (modal, focus, no navigation) + submit closes and adds in place;
# invalid title keeps dialog open with alert and other values (JS and no-JS POST); Escape and modal-cancel return focus;
# four viewports closed/open (no sideways scroll, controls >= 44x44); journal/encounter/loot forms not in a dialog.
# The last criterion (make test + other acceptance tests) is run by CI.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-194"
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
for _ in $(seq 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" PLAYWRIGHT_DIR="$PLAYWRIGHT_DIR" node --test --test-concurrency=1 "$HERE/scene-modal.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
