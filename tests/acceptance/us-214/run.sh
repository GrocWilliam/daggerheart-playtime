#!/usr/bin/env bash
# us-214: tier 3 adversaries translated into French. Criteria -> tests (fr-tier3.test.mjs unless noted):
# (1) srd-fr vitest passes, DONE.adversaries covers tier <= 3 (111) -> vitest + grep below, "23 ... complete entry"
# (2) French name and description differ from English        -> "name and description ... differ"
# (3) no Hope/Fear/Spotlight/Countdown/Hit Points words      -> "no French value ..."
# (4) lang=fr list nameLang fr for tiers 1-3 -> "lang=fr: list ..."
# (5) TERMS.md keeps its rows (terms.before.md is a copy)    -> "TERMS.md still holds ..."
# (6) make test: run by CI itself.
# Frozen tests updated: us-152 (700 -> 723 names), us-213 (tier 3 nameLang fr; its DONE grep accepts <= 3).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-214"
FAIL=0
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
npx vitest run src/lib/server/features/srd-fr.test.ts || FAIL=1
if grep -nE "adversaries:.*(<= *3|\\(\\) *=> *true)" src/lib/server/features/srd-fr.test.ts; then
  echo "ok - DONE.adversaries covers tier <= 3"
else
  echo "not ok - DONE.adversaries does not cover tier <= 3"; FAIL=1
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
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/fr-tier3.test.mjs" || { FAIL=1; echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
