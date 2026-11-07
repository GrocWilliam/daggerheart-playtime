#!/usr/bin/env bash
# us-210: per-line language for SRD help, reference, pick lists and character sheet.
# Criteria and tests:
# (1) fr /reference Barde: name in lang="fr", untranslated description in lang="en"  -> lang.test.mjs "French reference: core_class_bard..."
# (2) broadsword help first line: lang="fr" + Mêlée / lang="en" + Melee                -> lang.test.mjs "weapon core_weapon_broadsword..."
# (3) armor seuils/score vs thresholds/score; domain card niveau/coût de rappel vs level/recall cost
#                                                                                       -> lang.test.mjs "armor help..." / "domain card help..."
# (4) fr adv_acid_burrower: no raw key, facts line lang="fr" with role Solo             -> lang.test.mjs "French adversary..."
# (5) lang="en" literals in .svelte only on the srd-licence footer and LanguageSwitcher -> grep check below
# (6) fr character sheet names (Chosen, card, primary-weapon, equipped-armor) lang="fr" -> lang.test.mjs "French character sheet..."
# (7) fr tunnel class select posts Bard; creation succeeds                              -> lang.test.mjs "French tunnel..."
# (8) unit: helpLines('weapons', e, langs, 'fr')[0].lang === 'fr'; description lines lang 'en' (+ catalog keys)
#                                                                                       -> lines.unit.ts
# (9) make test and the other acceptance tests pass: run by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-210"
FAIL=0
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
[ -d node_modules ] || npm ci

# (5) no literal lang="en" in .svelte files except the srd-licence footer and the LanguageSwitcher.
BAD=$(grep -rn 'lang="en"' src --include=*.svelte | grep -v 'data-testid="srd-licence"' | grep -v '^src/lib/components/LanguageSwitcher.svelte:')
if [ -n "$BAD" ]; then
  echo "not ok - lang=\"en\" literals outside the srd-licence footer and LanguageSwitcher:"; echo "$BAD"; FAIL=1
else
  echo "ok - lang=\"en\" literals only on the srd-licence footer / LanguageSwitcher"
fi
grep -rn 'lang="en"' src/routes/+layout.svelte | grep -q 'data-testid="srd-licence"' || { echo "not ok - srd-licence footer lost its lang=\"en\""; FAIL=1; }

# (8) unit tests
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
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/lang.test.mjs" || { FAIL=1; echo "--- server log ---"; cat "$LOG"; }
exit $FAIL
