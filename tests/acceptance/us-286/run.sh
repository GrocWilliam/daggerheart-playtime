#!/usr/bin/env bash
# Criteria (US-286), character sheet at /characters/:id (sheet.test.mjs, en and fr):
# (1) "new character sheet shows proficiency 1 with its label and Help"
# (2) "after level 1 to 2 with traits agility and knowledge the sheet marks them"
# (3) "subclass-stage is absent without a subclass advancement and shows Specialization after one"
# (4) "sheet has no horizontal overflow at 360px"
# (5) make test and the other acceptance tests pass (run by CI)
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-286"
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
BASE_URL="http://localhost:$PORT_N" node --test --test-concurrency=1 "$HERE/sheet.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -20 "$LOG"; }
exit $FAIL
