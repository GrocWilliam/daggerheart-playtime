#!/usr/bin/env bash
# Criteria (US-126), one test each:
# (1) new character: six traits at 0 ........................ traits.test.mjs
# (2) PATCH subset keeps others; GET agrees ................. traits.test.mjs
# (3) PATCH 6 / -6 / 1.5 -> 400 agility message ............. traits.test.mjs + traits.unit.ts
# (4) PATCH unknown trait -> 400 ............................ traits.test.mjs + traits.unit.ts
# (5) POST with traits / out-of-range ....................... traits.test.mjs + traits.unit.ts
# (6) vitest messages, no database .......................... traits.unit.ts
# (7) sheet: signed values, form min/max, save, French ...... traits.test.mjs (Playwright)
# (8) drizzle-kit generate reports no changes; i18n + hardcoded tests pass (below)
# Starts `node build` on a free port with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-126"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run src/lib/i18n/hardcoded.test.ts src/lib/i18n/i18n.test.ts || FAIL=1
OUT=$(npx drizzle-kit generate --name us126_check 2>&1); echo "$OUT"
if ! echo "$OUT" | grep -qi "nothing to migrate\|No schema changes"; then echo "drizzle-kit generate found changes"; FAIL=1; fi
git clean -fdq drizzle 2>/dev/null; git checkout -q -- drizzle 2>/dev/null
ls drizzle | grep -q character_traits || { echo "no character_traits migration in drizzle/"; FAIL=1; }
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/traits.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $FAIL
