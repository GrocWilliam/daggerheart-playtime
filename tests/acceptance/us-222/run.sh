#!/usr/bin/env bash
# us-222: French text of weapons and armors.
# Criteria and tests:
# (1) srd-fr.test.ts passes with DONE.weapons/armors complete -> vitest srd-fr.test.ts + gear.unit.ts (DONE, completeness, shape, numbers)
# (2) one French translation per recurring English feature name -> gear.unit.ts
# (3) no whole word Hope/Fear/Armor Slot/Hit Points in the two files -> gear.unit.ts
# (4) fr sheet primary-weapon / equipped-armor in lang="fr" elements -> fr.test.mjs
# (5) TERMS.md keeps every row -> gear.unit.ts
# (6) make test passes: run by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-222"
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
