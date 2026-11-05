#!/usr/bin/env bash
# Criteria (tests in encounter-ui.test.mjs; i18n/hardcoded vitest checks here):
# 1 'Generate encounter' (no JS) shows data-testid=encounter-adversary entries (count, role, difficulty, HP, Stress,
#   thresholds, attack, damage, features in <details>) and data-testid=encounter-budget 'spent / budget';
#   button reads 'Regenerate' when one exists and replaces it; over-budget is visibly flagged;
# 2 changing a count (update button) or removing an adversary updates the budget; delete button removes the encounter;
# 3 form defaults (party size, tier inputs) match the campaign's characters;
# 4 French works (labels translated, SRD text English); i18n + hardcoded-text unit tests pass.
# Assumed English labels: inputs "Party size", "Tier"; checkboxes "Easier", "Damage boost", "Harder";
# buttons "Generate encounter"/"Regenerate", "Update", "Remove", "Delete encounter". Each adversary count input is
# type=number inside its data-testid=encounter-adversary. In French the encounter form is the form in the scene
# containing checkboxes. Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-157"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run src/lib/i18n || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/encounter-ui.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
