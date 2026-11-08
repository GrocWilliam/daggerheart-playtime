#!/usr/bin/env bash
# us-217: tier 3 and 4 environments translated into French. Criteria -> tests (fr-env.test.mjs unless noted):
# (1) srd-fr vitest passes, DONE.environments covers all 19      -> vitest + grep below, "complete French entry", "numbers"
# (2) name/description/impulses differ from English               -> "differ from the English ones"
# (3) no Hope/Fear/Spotlight/Countdown words                      -> "no French value ..."
# (4) lang=fr API nameLang fr for all 19                          -> "nameLang fr for all 19"
# (5) TERMS.md keeps its rows (terms.before.md is a copy)         -> "TERMS.md still holds ..."
# (6) make test and us-154: run by CI itself.
# Frozen test updated: us-152 (753 -> 760 names, all environment names are French now).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-217"
FAIL=0
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
npx vitest run src/lib/server/features/srd-fr.test.ts || FAIL=1
if grep -nE "environments: *\(?[a-z_]*\)? *=> *true" src/lib/server/features/srd-fr.test.ts; then
  echo "ok - DONE.environments accepts every id"
else
  echo "not ok - DONE.environments does not accept every id"; FAIL=1
fi
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
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/fr-env.test.mjs" || { FAIL=1; echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
