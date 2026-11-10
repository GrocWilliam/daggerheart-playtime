#!/usr/bin/env bash
# Criteria (US-102), tests in reference.test.mjs, one per criterion:
# (1) src/app.css under 150 lines and only import/palette/@theme/@layer base/pips/help marker rules;
# (2) no <style> block and no style= attribute in any .svelte under src;
# (3) computed styles unchanged on /reference (search form, kind filter, results, Help) at 375px and 1280px;
#     us-246: Help is now inline-level with a 44x44 bold "?" help-open and a fixed, centred, surface help-panel popover;
# (4) the us-38 colour scan passes; Help keeps the escaped word;
# (5) ui-style skill no longer describes the old app.css page rules;
# (6) make test / make build / other acceptance scripts are run by CI (not repeated here).
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-102"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/reference.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
