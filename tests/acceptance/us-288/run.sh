#!/usr/bin/env bash
# Criteria (US-288), level-up pages /characters/:id/level-up and the sheet link (levelup.test.mjs):
# (1) "sheet of a level 3 SRD-class character shows the level-up link to step 1", "... level 10 ... non-SRD ... no level-up link"
# (2) "without JavaScript a level 1 character levels up to 2 through the five steps" (en, fr)
# (3) "from level 3 step 1 shows nothing to choose and Next continues to step 2"
# (4) "at level 1 to 2 the step 2 selects list neither proficiency nor subclass", "at level 4 to 5 pick1 lists proficiency and pick2 does not"
# (5) "step 3 without pick1 redirects ...", "step 2 at a new level 2 without newExperience redirects ..."
# (6) "pick1=proficiency at 4 to 5 skips the details and the sheet then shows Proficiency 4"
# (7) "levelup-cancel leads to the sheet with nothing changed", "levelup-back returns to the previous step with the values kept"
# (8) "the level-up page of a level 10 character redirects to the sheet" (+ unknown id answers 404, from the load spec)
# (9) "no level-up page text or option contains multiclass"
# (10) "every level-up step has no horizontal overflow at 360px"
# (11) make test and the other acceptance tests pass (run by CI)
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-288"
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
UP=0
for _ in $(seq 400); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && { UP=1; break; }
  sleep 0.5
done
[ $UP -eq 1 ] || { echo "server did not start" >&2; tail -20 "$LOG"; exit 1; }
BASE_URL="http://localhost:$PORT_N" node --test --test-concurrency=1 "$HERE/levelup.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -20 "$LOG"; }
exit $FAIL
