#!/usr/bin/env bash
# Criteria (US-375), tests in sheet-header.test.mjs, one per criterion (the tab criterion has one test per tab):
# (1) GET /characters/<id> (English): no "← Campaign" text, exactly one link to /campaigns/<campaignId>, the campaign-run-link;
# (2) GET /characters/<id> in French (language cookie fr, the app's way to pick a language; there is no ?lang query):
#     no "← Campagne" text, campaign-run-link still present;
# (3) on every tab (play, traits, gear, cards, notes): no link before the h1 in the content, the divider directly after the h1;
# (4) src/lib/i18n/en.json and fr.json have no character.back key.
# "make test passes" is run by CI (make test), not repeated here: it runs npm ci, which must not overlap other scripts.
# Starts `node build` with in-memory PGlite (no Docker). HTTP only: no browser.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-375"
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
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/sheet-header.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
