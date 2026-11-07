#!/usr/bin/env bash
# US-195: New item, experience and card modals on the character sheet.
# modal.test.mjs (Node test runner + Playwright against `node build`, in-memory PGlite), one test per criterion:
#  openers (links, texts en/fr, hrefs ?new=...) and their placement; no-JS open dialog + aria-labelledby h2 (3 kinds);
#  no-JS submit adds the row (3 kinds); JS open (:modal, focus on first field) + add without reload (item Rope,
#  experience Sailor, card); invalid submissions keep the dialog open with [role=alert] and typed values (JS and no-JS);
#  Escape / modal-cancel close and return focus to the opener; edit form not in a dialog;
#  4 viewports x (closed, ?new=item): no sideways scroll, controls >= 44x44, text inputs 16px.
# `make test` and the other stories' acceptance scripts are run by CI separately.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-195"
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
BASE_URL="http://localhost:$PORT_N" PLAYWRIGHT_DIR="${PLAYWRIGHT_DIR:-}" node --test --test-concurrency=1 "$HERE/modal.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
