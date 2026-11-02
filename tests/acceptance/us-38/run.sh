#!/usr/bin/env bash
# Criteria (tests in design.test.mjs, one per criterion; browser checks run at 375x667 and 1280x800, en and fr):
# (1) :root defines --bg --surface --text --muted --accent --teal --danger with the specified values;
# (2) no colour literal in src/**/*.svelte|css outside those seven definitions;
# (3) body background/colour; (4) character-card surface + 2px solid accent border; (5) buttons accent/bg;
# (6) text contrast >= 4.5 on /, /campaigns/:id, /characters/:id; (7) keyboard focus outline >= 2px teal;
# (8) badges are pills with the specified colours; (9) no external requests (all requests same-origin).
# Builds the app, starts `node build` with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-38"
[ -d node_modules ] || npm ci
npm run build || { echo "build failed" >&2; exit 1; }
PW="$(mktemp -d)"
(cd "$PW" && npm init -y >/dev/null && npm i playwright-core >/dev/null 2>&1) || { echo "playwright-core install failed" >&2; exit 1; }
LOG="$(mktemp)"
PORT_N=$((20000 + RANDOM % 20000))
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$PW"' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PW" node --test "$HERE/design.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
