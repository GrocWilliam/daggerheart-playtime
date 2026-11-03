#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-92), one test each in zod-schemas.test.mjs:
# (1) package.json lists zod ^4 in dependencies;
# (2) grep for the old hand-written parse* functions in src finds nothing;
# (3) every endpoint under /api/campaigns, /api/characters, /api/items keeps its status and exact {"error"} string
#     for invalid bodies (and has no extra `issues` field); invalid JSON still gives 400 `malformed JSON`;
#     valid bodies and boundaries still succeed.
# Unit tests next to the code and "no acceptance file modified" are checked by `make test` and CI, not here.
# Starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-92"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test "$HERE/zod-schemas.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
