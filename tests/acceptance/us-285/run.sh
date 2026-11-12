#!/usr/bin/env bash
# Criteria (US-285), through GET/POST /api/characters/:id/level-up (levelup.test.mjs):
# (1) GET plan at level 1: "GET plan of a level 1 SRD-class character with two Experiences"
# (2) POST 1 to 2 and following GET: "POST 1 to 2 with newExperience, traits, experiences and a level-1 domain card"
# (3) each refusal message, character unchanged: one test per message (max level and SRD class also for GET)
# (4) "experience already exists" / "a character has at most 10 experiences", nothing saved
# (5) 4 to 5 accepts earlier marked traits: "4 to 5 accepts traits marked earlier; ..."
# (6) 4 to 5 proficiency: "4 to 5 with proficiency alone gives proficiency 4 ..."
# (7) unknown id 404: "unknown id: GET and POST answer 404 character not found"
# (8) make test and the other acceptance tests pass (run by CI)
# Starts `node build` on a free port with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-285"
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
