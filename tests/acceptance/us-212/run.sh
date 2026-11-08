#!/usr/bin/env bash
# us-212: tier 1 adversaries translated into French. Criteria -> tests (fr-adversaries.test.mjs unless noted):
# (1) srd-fr vitest passes with DONE.adversaries covering tier <= 1  -> vitest below + "52 ... complete entry", "keep dice and numbers"
#     (DONE is checked by grep below)
# (2) French description differs from English                        -> "description ... differs"
# (3) no Hope/Fear/Spotlight/Countdown/Hit Points whole words        -> "no French value ..."
# (4) API lang=fr/en acid burrower                                   -> "lang=fr: GET /api/srd/adversaries/..."
# (5) /reference French name + feature lines in lang="fr"            -> "lang=fr: /reference ..."
# (6) TERMS.md keeps its rows (terms.before.md is a copy)            -> "TERMS.md still holds ..."
# (7) make test: run by CI itself.
# Frozen tests updated (contradicted by this story): us-157, us-209 (api), us-152, us-210, us-211.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-212"
FAIL=0
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
npx vitest run src/lib/server/features/srd-fr.test.ts || FAIL=1
if grep -nE "adversaries:" src/lib/server/features/srd-fr.test.ts; then
  echo "ok - DONE.adversaries present"
else
  echo "not ok - DONE.adversaries missing"; FAIL=1
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
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/fr-adversaries.test.mjs" || { FAIL=1; echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
