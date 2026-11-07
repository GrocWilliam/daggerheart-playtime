#!/usr/bin/env bash
# us-219: French text of the ARCANA, SPLENDOR, GRACE, BONE and VALOR domain cards.
# Criteria and tests:
# (1) srd-fr.test.ts passes with DONE['domain-cards'] covering all 189 cards -> vitest src/lib/server/features/srd-fr.test.ts + cards.unit.ts (DONE and completeness/shape/numbers)
# (2) French text differs from English for each translated field other than name -> cards.unit.ts
# (3) no whole word Hope/Fear/Spotlight/Countdown/Hit Points in French values   -> cards.unit.ts
# (4) fr character sheet with a VALOR card: name and text in lang="fr"            -> fr.test.mjs
# (5) TERMS.md keeps every row                                                    -> cards.unit.ts
# (6) make test passes: run by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-219"
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
