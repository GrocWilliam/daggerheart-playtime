#!/usr/bin/env bash
# Criteria (US-345), one test each in buttons.test.mjs:
# (1) app.css: no `button` rule sets background-color/color; under 150 lines;
# (2) src/buttons.test.ts passes, and fails naming a temporary .svelte file holding a bare <button type="submit"> (also two variants -> fails, one variant -> passes);
# (3) browser, 11 pages x 375x812/1024x768 x en/fr: every visible button has exactly one btn-* class, one of the four computed looks, >= 44x44;
# (4) no form with more than one visible btn-primary; (5) delete/remove forms are btn-danger; (6) no sideways scroll at 360 and 375;
# (7) CLAUDE.md mentions src/buttons.test.ts. (8) Existing acceptance tests are run by CI.
# Details are opened before scanning, so buttons inside them are checked too.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-345"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -f "$ROOT"/src/lib/components/ZzTmp345*.svelte' EXIT
UP=0
for _ in $(seq 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && { UP=1; break; }
  sleep 0.5
done
[ $UP = 1 ] || { echo "server did not start"; cat "$LOG"; exit 1; }
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test --test-timeout=900000 "$HERE/buttons.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; tail -50 "$LOG"; }
exit $RC
