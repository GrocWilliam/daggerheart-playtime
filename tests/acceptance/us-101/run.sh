#!/usr/bin/env bash
# Criteria (US-101), tests in character.test.mjs, one per criterion:
# (1) computed styles unchanged on the character sheet at 375px and 1280px: trackers, condition badges, stats, gold, notes,
#     inventory table, cards list, chosen list, edit form grid, form cards, 44px targets, teal focus outline, no horizontal scroll;
# (2) character page and Chosen have no <style>/style=, no old classes (tracker, form-grid, stats, cards, chosen) in class="...",
#     no arbitrary/default-palette colours, data-testids kept; app.css no longer has the .tracker/.stats/.form-grid/.chosen rules;
# (3) the us-38 colour scan passes;
# (4) make test / make build / other acceptance scripts are run by CI (not repeated here).
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-101"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/character.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
