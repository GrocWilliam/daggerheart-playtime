#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-79), one test each in inventory-table.test.mjs:
# (1) no items -> no [data-testid="inventory"];
# (2) two items -> one table[data-testid=inventory]; 3 columnheaders named Name/Quantity/Actions (en) and Nom/Quantité/Actions (fr),
#     th scope="col"; 2 tr[data-testid=item-row] with 3 td each; first row's item text is "Rope ×2";
# (3) forms in the table: transparent background, padding 0, margin 0, input and buttons on one row;
# (4) ?/setQuantity changes the quantity (Rope ×5), ?/removeItem removes the row;
# (5) buttons and inputs in the table: >=44px targets and teal focus outline.
# Starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-79"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/inventory-table.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
