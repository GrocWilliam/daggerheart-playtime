#!/usr/bin/env bash
# us-216: tier 1 and 2 environments translated into French. Criteria -> tests (fr-env.test.mjs unless noted):
# (1) srd-fr vitest passes, DONE.environments covers tiers <= 2 -> vitest + grep below, "12 ... complete entry", "numbers"
# (2) name/description/impulses differ from English            -> "differ from the English ones"
# (3) no Hope/Fear/Spotlight/Countdown words                   -> "no French value ..."
# (4) API fr/en name of env_abandoned_grove                    -> "GET /api/srd/environments/..."
# (5) DM screen scene-environment/current-scene lang="fr"      -> "lang=fr: scene-environment ..."
# (6) TERMS.md keeps its rows (terms.before.md is a copy)      -> "TERMS.md still holds ..."
# (7) make test and us-154: run by CI itself.
# Frozen test updated: us-152 (741 -> 753 names; environment lists are no longer all English).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-216"
FAIL=0
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
npx vitest run src/lib/server/features/srd-fr.test.ts || FAIL=1
if grep -nE "environments: *(\\([a-z]*\\) *=> *(true|.*tier *<= *2)|.*tier *<= *2)" src/lib/server/features/srd-fr.test.ts; then
  echo "ok - DONE.environments is set"
else
  echo "not ok - DONE.environments not set to tier <= 2"; FAIL=1
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
