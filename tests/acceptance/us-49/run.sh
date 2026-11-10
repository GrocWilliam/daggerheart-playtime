#!/usr/bin/env bash
# Criteria (one test each in cards.test.mjs):
# (1) no card held: no data-testid="card" on the sheet;
# (2) held cards listed in the order added, each data-testid="card" with its name, domain, level (en + fr);
# (3) each card has a helper (data-testid=help, data-help=<card id>, help-open "?" named "Help: <name>" / "Aide : <nom>");
# (4) opened helper (us-246: help-panel popover, closed with help-close): >=44x44, name, and in a lang="en" block the SRD text of the card (no JavaScript);
# (5) add form: a select of the 189 cards (value = card id), grouped by domain in optgroups (9), labels in the page language,
#     the class's two domains first (checked for every class);
# (6) submitting the add form (no JS) holds the card: shown on the sheet and in the API;
# (7) the remove control of a card (no JS) removes it: gone from the sheet and the API;
# (8) 375px wide: no horizontal overflow, remove controls are at least 44x44.
# Builds the app, starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-49"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/cards.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
