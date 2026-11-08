#!/usr/bin/env bash
# us-211: DM screen shows SRD adversaries, environments and loot in the page language.
# Criteria and tests (dm-lang.test.mjs unless noted):
# (1) lang=en encounter-adversary: English name, role label, attack, damage dice, features; type physical/magic  -> "lang=en: ..."
# (2) lang=fr role via adversary.role.* in lang="fr", damage type physique/magique, dice unchanged            -> "lang=fr: role and damage..."
# (3) lang=fr untranslated adversary name and features in lang="en"                                           -> "lang=fr: untranslated adversary..."
# (4) lang=fr env_abandoned_grove type "Exploration" lang="fr" in scene-environment (Build) / current-scene (Run) -> "lang=fr: environment type..."
# (5) no literal lang="en" in the campaign +page.svelte                                                       -> grep below
# (6) same seed, same adversaries, English name/role in the API response                                      -> "encounter API..."
# (7) loot rolling and giving work; lang=fr loot-entry name has lang="fr"                                     -> "loot..."
# (8) make test and the other acceptance tests: run by CI itself.
# Note: the story says the en damage type reads "Physical"/"Magic"; the catalog says "physical"/"magical", so the
# English check is case-insensitive on /physical|magic/. No frozen test needed an update.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-211"
FAIL=0
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
if grep -n 'lang="en"' 'src/routes/campaigns/[id]/+page.svelte'; then
  echo "not ok - literal lang=\"en\" in the campaign page"; FAIL=1
else
  echo "ok - no literal lang=\"en\" in the campaign page"
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
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/dm-lang.test.mjs" || { FAIL=1; echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
