#!/usr/bin/env bash
# us-220: French text of the 18 ancestries and 9 communities.
# Criteria and tests:
# (1) srd-fr.test.ts passes with DONE.ancestries/communities complete -> vitest srd-fr.test.ts + heritage.unit.ts
# (2) translated fields other than name differ from English           -> heritage.unit.ts
# (3) no whole word Hope/Fear/Spotlight/Hit Points in French values    -> heritage.unit.ts
# (4) fr sheet: Chosen ancestry/community name + help lines lang="fr"  -> fr.test.mjs
# (5) fr tunnel stores English names                                   -> fr.test.mjs
# (6) TERMS.md keeps every row                                         -> heritage.unit.ts
# (7) make test passes: run by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-220"
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
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/fr.test.mjs" || { FAIL=1; echo "--- server log ---"; cat "$LOG"; }
exit $FAIL
