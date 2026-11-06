#!/usr/bin/env bash
# Criteria (one test each in scenario.test.mjs; i18n/hardcoded vitest checks here):
# 1 campaign page has the step-build link (was: link to the scenario page, moved by us-175);
# 2 scenario page lists scenes in order (data-testid=scene); without JS the forms add, edit, move up/down,
#   set current, mark done and delete work (JS disabled in Chromium);
# 3 current scene title in data-testid=current-scene on the campaign page, absent when none current;
# 4 a scene with an environment shows name, type, difficulty, impulses, features (in <details>);
# 5 works in en and fr; i18n and hardcoded-text unit tests pass.
# Assumed control labels (English catalog): buttons "Move up", "Move down", "Set current", "Done" (mark done),
# "Delete"; add form is outside any scene and has fields title, notes, environmentId; each scene's edit form
# has a title input and a submit button. Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-154"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run src/lib/i18n || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/scenario.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
