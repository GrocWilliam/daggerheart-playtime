#!/usr/bin/env bash
# Criteria (US-128), one test each:
# (1) new character: all three fields null ................. gear.test.mjs
# (2) valid tier 1 gear 200, null unequips ................. gear.test.mjs
# (3) wrong type / unknown id 400 messages ................. gear.test.mjs (+ gear.unit.ts)
# (4) tier above character's tier 400, ok at level 2 ....... gear.test.mjs (+ gear.unit.ts tier mapping)
# (5) two-handed primary + secondary 400 ................... gear.test.mjs (+ gear.unit.ts)
# (6) armor sets max/thresholds, caps marked, null keeps ... gear.test.mjs
# (7) vitest without database; drizzle-kit generate clean .. below
# Starts `node build` on a free port with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-128"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
OUT=$(npx drizzle-kit generate --name us128_check 2>&1); echo "$OUT"
if ! echo "$OUT" | grep -qi "nothing to migrate\|No schema changes"; then echo "drizzle-kit generate found changes"; FAIL=1; fi
git clean -fdq drizzle 2>/dev/null; git checkout -q -- drizzle 2>/dev/null
grep -rqiE "primary_weapon|armor_id" drizzle || { echo "no gear migration in drizzle/"; FAIL=1; }
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/gear.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $FAIL
