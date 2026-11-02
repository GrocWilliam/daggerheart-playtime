#!/usr/bin/env bash
set -uo pipefail
# Acceptance tests for issue #9 (Items endpoints). Builds the app,
# starts `node build` on a free port with a temp PGlite dir, runs items.test.mjs.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-9"
[ -d node_modules ] || npm ci
npm run build || { echo "build failed" >&2; exit 1; }
DATA="$(mktemp -d)"; LOG="$(mktemp)"
PORT_N=$((20000 + RANDOM % 20000))
BASE="http://localhost:$PORT_N"
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="$DATA"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$DATA"' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="$BASE" node --test "$HERE/items.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
