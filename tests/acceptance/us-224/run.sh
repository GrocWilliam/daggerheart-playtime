#!/usr/bin/env bash
# us-224: every SRD kind fully translated; no French page shows English outside the footer.
# Criteria and tests:
# (1) srd-fr.test.ts iterates SRD_KINDS, no allow-list, passes -> vitest srd-fr.test.ts + complete.unit.ts (no DONE)
# (2) localizedSrd(kind,id,'fr').langs is 'fr' for every translated field present -> complete.unit.ts
# (3) fr pages have no lang="en" outside footer -> pages.test.mjs
# (4) footer srd-licence stays lang="en" -> pages.test.mjs
# (5) lang=en keeps English names -> pages.test.mjs
# (6) no fr.json reader, no en: string[] prop, CLAUDE.md row updated -> complete.unit.ts
# (7) make test / other acceptance tests: run by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-224"
FAIL=0
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
[ -d node_modules ] || npm ci
npx vitest run src/lib/server/features/srd-fr.test.ts || FAIL=1
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1

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
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/pages.test.mjs" || { FAIL=1; echo "--- server log ---"; cat "$LOG"; }
exit $FAIL
