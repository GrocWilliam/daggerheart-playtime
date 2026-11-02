#!/usr/bin/env bash
set -uo pipefail
# Acceptance tests for issue #11 (Campaign page). Builds the app, starts
# `node build` on a free port with a temp PGlite dir, runs campaign-page.test.mjs.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-11"
[ -d node_modules ] || npm ci
npm run build || { echo "build failed" >&2; exit 1; }
DATA="$(mktemp -d)"; LOG="$(mktemp)"
PORT_N=$((20000 + RANDOM % 20000))
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="$DATA"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$DATA"' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/campaign-page.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
