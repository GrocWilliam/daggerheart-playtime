#!/usr/bin/env bash
# Criteria (one test each in adversaries.test.mjs):
# (1) adversaries.json / environments.json have the given SHA-256; LICENSE.md gains a line naming the second source;
# (2) API lists 129 adversaries / 19 environments in file order, ids adv_/env_ unique;
# (3) every adversary has numeric tier 1-4 and a valid role; 'Horde (3/HP)' -> 'Horde';
# (4) GET /<id> returns the element + nameLocalized; unknown id -> 404 {"error":"unknown SRD element"};
# (5) fr.json keeps 612 keys; French names are the English ones;
# (6) /reference has ref-adversaries and ref-environments.
# (7) Vitest tests (no database) under src/lib/server/features mention BOM, slug, role and tier of adversaries and pass.
# Starts `node build` with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-152"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/adversaries.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
