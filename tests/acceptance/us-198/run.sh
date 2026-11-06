#!/usr/bin/env bash
# Criteria (US-198), tests in removal.test.mjs (Node test runner + Playwright against `node build`, in-memory PGlite):
# (1) no file under src contains "addCharacter" (grep -rn addCharacter src prints nothing)
# (2) POST /campaigns/:id?/addCharacter with a same-origin form body creates no character (count unchanged)
#     (characters counted through GET /api/campaigns/:id, which lists them)
# (3) ?step=build still shows new-character linking to the tunnel and party-member rows
# (4) a character created through the tunnel (no JS) lands on /characters/:newId, and is listed by the API
# (5) make test: vitest run below (i18n and hard-coded text tests); the other acceptance scripts are run by CI
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-198"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/removal.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
