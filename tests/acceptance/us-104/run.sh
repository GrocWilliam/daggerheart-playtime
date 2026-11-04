#!/usr/bin/env bash
# Criteria (US-104), one test each:
# (1) scanner passes on the code; fails on an inline `<button>Save</button>`: src/lib/i18n/hardcoded.test.ts (dev's) is run, and
#     scan.unit.ts re-implements the scan (svelte AST) and checks the code and the fixture;
# (2) t('...') keys exist in both catalogs (scan.unit.ts + dev's hardcoded.test.ts); unused keys: dev's test;
# (3) key parity: src/lib/i18n/i18n.test.ts + scan.unit.ts;
# (4) fr pages: translated form errors / 404s (no raw API string), >=5 cases: pages.test.mjs (HTTP, `node build`, in-memory PGlite);
# (5) full `make test` / acceptance suite: run by CI.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-104"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run src/lib/i18n/hardcoded.test.ts src/lib/i18n/i18n.test.ts || FAIL=1
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
