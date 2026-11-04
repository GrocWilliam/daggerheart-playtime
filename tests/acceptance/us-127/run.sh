#!/usr/bin/env bash
# Criteria (US-127), one test each:
# (1) new character: experiences [] ........................ experiences.test.mjs
# (2) POST trims name, 201, oldest first .................... experiences.test.mjs
# (3) 11th experience -> 400 message ........................ experiences.test.mjs
# (4) duplicate (case/spaces) 409; PATCH duplicate 409 ...... experiences.test.mjs
# (5) schema messages (modifier 0/6/1.5, empty/long name) ... experiences.unit.ts (+ HTTP 400 in .test.mjs)
# (6) PATCH, DELETE, 404s ................................... experiences.test.mjs
# (7) sheet: display, add (default 2), change, remove, FR ... experiences.test.mjs (Playwright)
# (8) cascade on character/campaign delete (204); drizzle-kit generate no changes (below)
# Starts `node build` on a free port with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-127"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run src/lib/i18n/hardcoded.test.ts src/lib/i18n/i18n.test.ts || FAIL=1
OUT=$(npx drizzle-kit generate --name us127_check 2>&1); echo "$OUT"
if ! echo "$OUT" | grep -qi "nothing to migrate\|No schema changes"; then echo "drizzle-kit generate found changes"; FAIL=1; fi
git clean -fdq drizzle 2>/dev/null; git checkout -q -- drizzle 2>/dev/null
ls drizzle | grep -qi experience || { echo "no experiences migration in drizzle/"; FAIL=1; }
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/experiences.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $FAIL
