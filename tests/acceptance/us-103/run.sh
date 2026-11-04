#!/usr/bin/env bash
# Criteria (US-103), one test each:
# (1) translate placeholders / plurals (en, fr; fr 0 is "one") / missing param / fallbacks: i18n.unit.ts (Vitest, catalogs mocked);
# (2) formatNumber en "1,234,567", fr without ",": i18n.unit.ts;
# (3) key-parity test: src/lib/i18n/i18n.test.ts, run here too;
# (4) pages show gold and item quantity via formatNumber (U+202F in fr, only [ \t\r\n] collapsed), unchanged below 1000: pages.test.mjs.
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-103"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run src/lib/i18n/i18n.test.ts || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/pages.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $FAIL
