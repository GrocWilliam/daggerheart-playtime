#!/usr/bin/env bash
# Criteria (one test each in inventory.test.mjs):
# (1) POST /api/characters/:id/items {srdId} -> 201, name = SRD English name, srdId echoed, quantity (default 1);
#     the item is in GET /api/characters/:id (works for a weapon, armor, consumable and item);
# (2) unknown srdId (or non-string / a card id) -> 400, nothing added;
# (3) merging by name works: the same srdId twice, or a free-text name equal to the SRD name, sums quantities in one item;
# (4) sheet add form: a select "from the SRD" next to the free-text name input, with 4 optgroups
#     (weapons, armors, consumables, items), every SRD entry as an option (value = id), labels in the page language (en + fr);
# (5) submitting the form with only the SRD select (no JS) adds the item (name in English, srdId) to the sheet and the API;
# (6) an item with an srdId shows its helper (details data-testid=help, data-help=<id>, summary "?" named
#     "Help: ..." / "Aide : ..."), a free-text item has none;
# (7) opened helper: >=44x44 target, SRD text of the entry in a lang="en" block, no JavaScript;
# (8) 375px wide: no horizontal overflow, the SRD select is within the viewport.
# Builds the app, starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-50"
[ -d node_modules ] || npm ci
npm run build || { echo "build failed" >&2; exit 1; }
PW="$(mktemp -d)"
(cd "$PW" && npm init -y >/dev/null && npm i playwright-core >/dev/null 2>&1) || { echo "playwright-core install failed" >&2; exit 1; }
LOG="$(mktemp)"
PORT_N=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$PW"' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PW" node --test "$HERE/inventory.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
