#!/usr/bin/env bash
# Criteria (US-252). tunnel.unit.ts and armors.unit.ts run with vitest (armors.unit.ts fetches the running server);
# tunnel.test.mjs runs with Node's test runner + Playwright (JS disabled) against `node build` with in-memory PGlite.
# (1) step 3 fields: six required trait selects (blank, +2 +1 +0 -1), armorId select starting with option.none, no old
#     stat inputs: tunnel.test.mjs "step 3 has exactly...", "each trait select...", "the armor select..."; tunnel.unit.ts "step 3 fields"
# (2) Warrior L3 chainmail 10, 10/18, 6, 6, 4; unarmored 11, 3/6, 6, 6, 0 (en, fr): tunnel.test.mjs; tunnel.unit.ts "characterBody"
# (3) nine classes at level 1, HP/Evasion: tunnel.test.mjs "each of the nine classes..."
# (4) unarmored thresholds 1/2 at level 1, 10/20 at level 10: tunnel.test.mjs
# (5) traits 2,2,1,0,0,-1 or a blank trait -> ?step=3&invalid=traits + tunnel.traitsArray alert (en, fr): tunnel.test.mjs; tunnel.unit.ts "firstInvalid, step 3"
# (6) armor above the tier / unknown armor -> ?step=3&invalid=armorId: tunnel.test.mjs; tunnel.unit.ts
# (7) level 1 lists only tier 1 armors = armorGroups(1, lang): armors.unit.ts
# (8) review shows signed traits and the localized armor name (with lang) or option.none: tunnel.test.mjs
# (9) no-JS creation ends on the sheet with traits, equipped armor and computed stats: tunnel.test.mjs
# (10) hand-made POST without valid traits -> ?step=3&invalid=traits: tunnel.test.mjs
# (11) docs/ui.md lists the new test ids, traits no longer planned: tunnel.test.mjs; `make test` is run by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-252"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
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
[ $UP -eq 1 ] || { echo "server did not answer /health" >&2; cat "$LOG"; exit 1; }
US252_BASE="http://localhost:$PORT_N" npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/tunnel.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
