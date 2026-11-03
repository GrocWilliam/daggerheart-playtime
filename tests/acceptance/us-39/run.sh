#!/usr/bin/env bash
# Criteria (tests in fonts.test.mjs, one per criterion; browser checks at 375x667 and 1280x800, en and fr):
# (1) h1/h2/h3 and character-name computed font-family starts with Cinzel, ends with serif, weight 700;
# (2) all other text (incl. buttons, inputs) starts with "EB Garamond", ends with serif;
# (3) @fontsource/cinzel and @fontsource/eb-garamond are dependencies, imported in src/routes/+layout.svelte;
# (4) no request leaves the app's origin; font files are served by the app;
# (5) after document.fonts.ready, fonts.check('700 16px Cinzel') and ('16px "EB Garamond"') are true and the faces are loaded.
# Builds the app, starts `node build` with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-39"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/fonts.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
