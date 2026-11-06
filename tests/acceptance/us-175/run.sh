#!/usr/bin/env bash
# Criteria (tests in step-switch.test.mjs; `make test` = vitest here):
# 1 GET /campaigns/:id/scenario -> 308 to /campaigns/:id?step=build
# 2 default and ?step=bogus render the Run step (fear, character-card, no build, step-run aria-current)
# 3 ?step=build renders Build (party-member rows, add-character form, scenes + forms); en/fr step texts
# 4 moved actions work on the campaign page; unit tests moved (vitest)
# 5 home creation lands on ?step=build; 6 step click is a client-side navigation; 7 no scenario +page.svelte
# Assumed: add-character form action is "?/addCharacter", add-scene form "?/add". No Docker.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-175"
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
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/step-switch.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
