#!/usr/bin/env bash
# Criteria (one test each in scenes.test.mjs, plus drizzle check here):
# POST defaults/trim/last; 400 messages; 404s; single current; move; DELETE 204; campaign cascade;
# GET /api/campaigns/:id unchanged; scenes.test.ts exists; drizzle-kit generate reports no changes.
# Starts `node build` with in-memory PGlite (no Docker). Commit the drizzle/ migration before running.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-153"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
OUT=$(npx drizzle-kit generate --name us153_check 2>&1); echo "$OUT"
if ! echo "$OUT" | grep -qi "nothing to migrate\|No schema changes"; then echo "drizzle-kit generate found changes"; FAIL=1; fi
git clean -fdq drizzle 2>/dev/null; git checkout -q -- drizzle 2>/dev/null
grep -rqiE "scenes" drizzle || { echo "no scenes migration in drizzle/"; FAIL=1; }
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/scenes.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
