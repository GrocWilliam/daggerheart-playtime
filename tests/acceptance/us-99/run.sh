#!/usr/bin/env bash
# Criteria (US-99), tests in layout.test.mjs, one per criterion:
# (1) computed styles unchanged for / (layout header, nav, footer, language switcher, campaign list, create form) at 375 and 1280:
#     colours, borders, fonts, 44px targets, focus outline, no horizontal scroll;
# (2) app.css has none of the old selectors (.site-header, .lang-switcher, nav, campaign-link);
#     layout/page/switcher have no <style> block or style= attribute and use only theme-token utilities (no arbitrary or default-palette colours);
# (3) the us-38 colour scan (no colour literal/name in src svelte/css) passes;
# (4) make test / make build / other acceptance scripts are run by CI (not repeated here).
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-99"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/layout.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
