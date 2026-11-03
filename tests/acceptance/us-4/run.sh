#!/usr/bin/env bash
set -uo pipefail
# Acceptance tests for issue #4 (Characters API). Builds the app, starts
# `node build` on a free port with a temp PGlite dir, runs characters.test.mjs,
# then the "PATCH maxHp lowers hp.marked" criterion: since no endpoint marks HP
# yet, the server is stopped, hp_marked is set to 4 directly in the PGlite dir,
# and the server is restarted before the PATCH.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-4"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
DATA="$(mktemp -d)"; LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
BASE="http://localhost:$PORT_N"
PID=
start() {
  (unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="$DATA"; exec node build) >>"$LOG" 2>&1 &
  PID=$!
  for _ in $(seq 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")" = 200 ] && return 0
    sleep 0.5
  done
}
stop() { [ -n "$PID" ] && { kill $PID 2>/dev/null; wait $PID 2>/dev/null; PID=; }; }
trap 'stop; rm -rf "$DATA"' EXIT
fail() { echo "FAIL: $*" >&2; echo "--- server log ---"; cat "$LOG"; exit 1; }

start
BASE_URL="$BASE" node --test "$HERE/characters.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; exit $RC; }

# Criterion: PATCH {"maxHp":3} with hp.marked 4 -> hp {marked:3,max:3}
J='content-type: application/json'
CID=$(curl -s -X POST -H "$J" -d '{"name":"MaxHp"}' "$BASE/api/campaigns" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
CH=$(curl -s -X POST -H "$J" -d '{"name":"Rook","class":"Guardian","evasion":10,"majorThreshold":5,"severeThreshold":10,"maxHp":6,"armorSlots":3}' "$BASE/api/campaigns/$CID/characters" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
[ -n "$CH" ] && [ "$CH" != undefined ] || fail "could not create character"
stop
node "$HERE/setmarked.mjs" "$DATA" "$CH" 4 || fail "could not set hp_marked"
start
OUT=$(curl -s -w '\n%{http_code}' -X PATCH -H "$J" -d '{"maxHp":3}' "$BASE/api/characters/$CH")
CODE=${OUT##*$'\n'}; BODY=${OUT%$'\n'*}
[ "$CODE" = 200 ] || fail "PATCH maxHp expected 200, got $CODE: $BODY"
echo "$BODY" | node -e '
const c=JSON.parse(require("fs").readFileSync(0));
if(c.hp?.marked!==3||c.hp?.max!==3||c.down!==true){console.error("bad hp",JSON.stringify(c));process.exit(1)}' || fail "hp not lowered"
echo "PATCH maxHp lowers hp.marked: ok"
