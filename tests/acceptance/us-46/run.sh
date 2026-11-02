#!/usr/bin/env bash
# Criteria (one test each in characters-srd.test.mjs):
# (1) character JSON has subclass, ancestry, community = null and cards = [] by default (POST, GET, PATCH);
# (2) item JSON has srdId = null (POST and character GET);
# (3) PATCH accepts an SRD subclass of the character's class, an ancestry, a community; persisted on GET;
# (4) PATCH with null resets each of them;
# (5) a subclass of another class -> 400, nothing changed;
# (6) unknown id / id of another kind / non-string -> 400, nothing changed;
# (7) class stays a free string.
# Builds the app, starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-46"
[ -d node_modules ] || npm ci
npm run build || { echo "build failed" >&2; exit 1; }
LOG="$(mktemp)"
PORT_N=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/characters-srd.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
