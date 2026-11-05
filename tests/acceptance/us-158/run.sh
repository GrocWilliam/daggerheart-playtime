#!/usr/bin/env bash
# Criteria (one test each in loot.test.mjs):
# rolls ranges per rarity + srdId/name of entry number roll; count 3 appends 3; 400 for count 0/11, table, rarity;
# same seed same rolls; PATCH given persists; DELETE removes; 404s; scene JSON lists loot;
# Vitest file src/lib/server/features/loot.test.ts exists and passes (no database).
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-158"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
[ -f src/lib/server/features/loot.test.ts ] || { echo "loot.test.ts missing"; FAIL=1; }
[ -f src/lib/server/features/loot.ts ] || { echo "loot.ts missing"; FAIL=1; }
if [ -f src/lib/server/features/loot.test.ts ]; then
  npx vitest run src/lib/server/features/loot.test.ts || FAIL=1
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
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/loot.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
