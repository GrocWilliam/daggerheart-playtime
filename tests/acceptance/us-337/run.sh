#!/usr/bin/env bash
# Criteria (tests in help.test.mjs, browser; the Help.test.ts unit criterion is the dev's, outside tests/acceptance):
# (1) ?tab=play at 375x812 and 1024x768, en + fr, all three conditions: no help-open is "?"; hp, stress, hope, armor,
#     evasion, thresholds helpers read their label;
# (2) Run step: no help-open in a character-card is "?"; the Fear helper reads the Fear label;
# (3) labelled help-open: dotted underline, >= 44x44, aria-label "Help: <name>" / "Aide : <nom>";
# (4) a tracker form shows its label text exactly once;
# (5) ?tab=traits: each trait row's help-open reads the trait name;
# (6) the help-open inside `subclass` shows the subclass name;
# (7) /reference: every help-open is still "?";
# (8) JavaScript disabled: clicking the HP help-open opens its help-panel (:popover-open).
# (9) updated us-45, us-48, us-301 are run by their own scripts.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-337"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
UP=0
for _ in $(seq 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && { UP=1; break; }
  sleep 0.5
done
[ $UP = 1 ] || { echo "server did not start"; cat "$LOG"; exit 1; }
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/help.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
