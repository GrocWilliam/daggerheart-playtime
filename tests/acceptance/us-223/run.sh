#!/usr/bin/env bash
# us-223: French text of items, consumables and rules.
# Criteria and tests:
# (1) srd-fr.test.ts passes with DONE.items/consumables/rules complete -> vitest srd-fr.test.ts + kinds.unit.ts (DONE, completeness, shape, numbers)
# (2) every rule's translated fields other than name differ from English -> kinds.unit.ts
# (3) no whole word Hope/Fear/Spotlight/Countdown/Hit Points in the three files -> kinds.unit.ts
# (4) fr sheet item help and DM-screen loot-entry text in lang="fr"    -> fr.test.mjs
# (5) TERMS.md keeps every row                                          -> kinds.unit.ts
# (6) make test passes: run by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-223"
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
