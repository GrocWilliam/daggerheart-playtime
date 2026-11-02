#!/usr/bin/env bash
# Criteria (one test each in cards-items.test.mjs):
# (1) character JSON has cards = [] by default (POST, GET, PATCH);
# (2) POST /cards -> 201 and the character; GET shows cards in order added;
# (3) unknown or non-card id -> 400, nothing changed; missing/non-string cardId -> 400;
# (4) already held -> 409, no duplicate; unknown character -> 404;
# (5) DELETE /cards/<id> -> 204 and removed (order of others kept); not held -> 404; re-add works;
# (6) POST items {srdId} -> 201, name = SRD English name, srdId set, quantity default 1 / given;
# (7) unknown srdId -> 400, nothing added; weapons, armors, consumables, items all accepted;
# (8) merging by name: same srdId twice sums quantity (200), and merges with a free-text item of that name;
# (9) the French cookie does not change the stored name (English).
# Earlier tests #4 and #9 already list the new keys; no other test needs changes.
# Builds the app, starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-47"
[ -d node_modules ] || npm ci
npm run build || { echo "build failed" >&2; exit 1; }
LOG="$(mktemp)"
PORT_N=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/cards-items.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
