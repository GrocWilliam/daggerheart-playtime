#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-96), tests in characters-drizzle.test.mjs:
# (1) characters.ts and the character handlers (CRUD, trackers, damage, gold, conditions, cards, campaign characters)
#     hold no raw SQL strings nor TRACKER_SQL/DAMAGE_SQL/GOLD_SQL/CHARACTER_COLS and no db.query;
# (2) characters.test.ts runs on in-memory PGlite and covers create, patch, trackers at bounds, damage with/without armor,
#     gold floor, conditions and cards (vitest);
# (3) every character endpoint keeps its JSON, statuses and errors;
# (4) make test / build / other scripts are run by CI. Starts `node build` on a free port, in-memory PGlite (no Docker).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-96"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test "$HERE/characters-drizzle.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
