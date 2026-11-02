#!/usr/bin/env bash
# Criteria (no explicit ones in the story beyond the listed bullets; one test each in srd.test.mjs):
# (1) the 10 SRD files in src/lib/srd/core/ have the given SHA-256;
# (2) src/lib/srd/LICENSE.md holds the notice;
# (3) the footer of every page shows the notice's first sentence (en and fr);
# (4) GET /api/srd/<kind> lists every kind with the right count, {id,name}, file order;
# (5) ids/names: classes Bard, domains core_domain_<lowercase>;
# (6) GET /api/srd/<kind>/<id> returns the file object unchanged + nameLocalized (en and fr = English);
# (7) unknown kind / unknown id -> 404 {"error"}.
# Builds the app, starts `node build` with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-43"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PW" node --test "$HERE/srd.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
