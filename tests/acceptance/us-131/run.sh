#!/usr/bin/env bash
# Criteria (US-131), tests in dropdowns.test.mjs, one per criterion:
# (1) class select on the Add character form: one option per SRD class, English value; in French labels are French, values English;
# (2) ancestry and community selects: empty "None" option first, then every SRD ancestry/community (English name as value);
# (3) submitting with a chosen class, ancestry and community creates the character, the sheet shows them;
# (4) submitting with None for ancestry and community creates the character with them empty;
# (5) existing acceptance tests that fill these fields: none fills them as text in a browser (us-11 posts raw form data,
#     which works unchanged with selects), so no frozen test needed an update;
# (6) i18n and hardcoded-text tests: run by `make test`, plus a check here that the None label key exists in en and fr.
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-131"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/dropdowns.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
