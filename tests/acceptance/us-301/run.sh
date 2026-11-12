#!/usr/bin/env bash
# Criteria (US-301), tests in components.test.mjs:
# (1) the four components exist; both pages import Tracker, DefenseLine, DamageForm (+ pages hold no own copy,
#     components import no routes);
# (2) sheet 1024x768: label, -, value, +, pips on one row (centres within 6px), value between - and +;
# (3) sheet 375x812: label, -, value, + on one row;
# (4) the same on each Run character card;
# (5) evasion/thresholds tops within 4px, line contains a middle dot, line is ul.stats (sheet and Run cards);
# (6) 1024x768: damage form amount input and button bottoms within 4px;
# (7) sheet HP + / - change hp by 1, with and without JavaScript;
# (8) damage 3 on a Run card marks 1 HP on that character.
# (9) "all acceptance scripts and make test pass" is enforced by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-301"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test --test-timeout=300000 "$HERE/components.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
