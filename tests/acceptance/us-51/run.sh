#!/usr/bin/env bash
# Criteria (tests in reference.test.mjs):
# (1) /reference has one section data-testid="ref-<kind>" per SRD kind, in the page language;
# (2) every element is a data-testid="ref-item" with its name (en or fr) and a helper (details[data-testid=help]);
# (3) GET filter ?kind=<kind> keeps only that kind's section(s);
# (4) ?q= is a case-insensitive substring of the name in either language (weapons&q=sword example);
# (5) kind and q combine; no match -> no items;
# (6) a "/reference" link is in the header of every page (home, campaign, character, reference);
# (7) helpers open and show lang="en" SRD text; summary >= 44x44; no horizontal overflow at 360px.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-51"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/reference.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
