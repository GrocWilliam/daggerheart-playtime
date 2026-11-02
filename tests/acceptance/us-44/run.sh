#!/usr/bin/env bash
# Criteria (one test each in fr.test.mjs):
# (1) fr.json: 612 non-empty names, one per element id of every kind; the fixed names are exact;
# (2) domains.json: en/fr texts of the 9 domains;
# (3) glossary.json: the 12 terms with en/fr texts;
# (4) list API in French returns French names, in file order; en/default stay English;
# (5) element API in French: file object unchanged + nameLocalized French; en stays English;
# (6) 404 for unknown kind/id.
# Builds the app, starts `node build` with PGLITE_DATA_DIR=memory:// (no Docker, no browser needed).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-44"
[ -d node_modules ] || npm ci
npm run build || { echo "build failed" >&2; exit 1; }
LOG="$(mktemp)"
PORT_N=$((20000 + RANDOM % 20000))
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; ' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/fr.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
