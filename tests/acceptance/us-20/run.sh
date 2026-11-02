#!/usr/bin/env bash
# Criteria: (1) every heading/label/button/placeholder of / comes from the dictionaries;
# (2) lang=fr page text has no differing en.json value as a whole word (and vice versa);
# (3) lang=fr text contains Campagne; (4) campaign names appear as entered in both languages.
# Builds the app, starts `node build` with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-20"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PW" node --test "$HERE/home.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
