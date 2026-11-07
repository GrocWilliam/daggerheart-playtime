#!/usr/bin/env bash
# US-193: Modal component and the home page's New campaign modal.
# Tests: busy.unit.ts (Vitest, busy closes the enclosing dialog on success only, busy.test.ts exists),
# `npx vitest run` (make test: i18n, hard-coded text, colour, enhance, no <style>/style=),
# modal.test.mjs (Node test runner + Playwright against `node build` with in-memory PGlite), one test per criterion:
# opener text/href (en, fr); no-JS open dialog + aria-labelledby h2; no-JS cancel href and closed on /; no-JS submit;
# JS open (no navigation, :modal, focus) + Escape; Cancel; backdrop click; JS submit Ashfall; empty name (JS and no-JS);
# 375x812 full screen; 1024x768 panel and backdrop opacity.
# The other stories' acceptance scripts are run by CI separately.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-193"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run || FAIL=1
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" PLAYWRIGHT_DIR="$PLAYWRIGHT_DIR" node --test --test-concurrency=1 "$HERE/modal.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
