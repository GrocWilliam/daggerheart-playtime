#!/usr/bin/env bash
# Criteria (tests in run-scene.test.mjs):
# 1 current scene shown in run [data-testid=current-scene] with title/environment, not other scenes
# 2 no current scene: text + build link (en/fr), no Next scene button, no scene-notes
# 3 nextScene action: A done, B current; last -> none current (unit test of storage fn is the dev job)
# 4 JS autosave: Saving…/Saved, blur saves, failure shows error.server
# 5 no JS: Save posts ?/edit with notes only; other fields unchanged
# 6 layout: two columns at 1280, stacked without h-scroll at 390
# Assumed: nextScene form action is "?/nextScene". No Docker.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-176"
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
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/run-scene.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
