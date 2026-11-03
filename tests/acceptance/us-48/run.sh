#!/usr/bin/env bash
# Criteria (one test each in picklists.test.mjs):
# (1) edit form: `class` is a select of the 9 classes (values Bard.., labels in the page's language, en + fr);
# (2) `subclass` select: "none" + only the chosen class's 2 subclasses; `ancestry` and `community` selects: "none" + all;
# (3) a stored class outside the 9 stays selected as is (and the form still saves);
# (4) saving the form with a class/subclass/ancestry/community persists them (API) and "none" resets;
# (5) chosen subclass/ancestry/community show name + helper (data-testid subclass/ancestry/community, data-help=<id>) on the sheet;
# (6) same on the character-card of the campaign page; nothing shown when none is chosen;
# (7) French: names in French on sheet and card; helper aria-label "Aide : <nom>";
# (8) helper of an SRD element: <details>, "?" summary named "Help: <name>", >=44x44, opened shows name and,
#     in a lang="en" block, description paragraphs and each feature as "<name>: <text>"; works without JavaScript.
# The edit form is submitted like a browser (no JS) and also driven in Chromium.
# Builds the app, starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-48"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/picklists.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
