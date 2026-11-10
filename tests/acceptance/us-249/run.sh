#!/usr/bin/env bash
# US-249: recomputeOnPatch (rules.test.ts, vitest, no DB) and PATCH /api/characters/:id recomputation (api.test.mjs, node build, in-memory PGlite).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-249"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.mjs" || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -f "$LOG"' EXIT
UP=0
for _ in $(seq 400); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ]; then UP=1; break; fi
  kill -0 $PID 2>/dev/null || break
  sleep 0.5
done
if [ $UP -ne 1 ]; then echo "server did not start" >&2; tail -30 "$LOG"; exit 1; fi
BASE_URL="http://localhost:$PORT_N" node --test --test-concurrency=1 "$HERE/api.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
