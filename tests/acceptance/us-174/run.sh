#!/usr/bin/env bash
# Criteria: GET list (newest first, ISO createdAt, [] when empty); POST trims -> 201; POST validation 400s;
# 404 unknown campaign; DELETE entry 204 / 404; campaign deletion cascades to journal_entries (checked by
# stopping the server and reading the file-backed PGlite database). Also: drizzle-kit generate reports no changes.
# Starts `node build` directly (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-174"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
TMP="$(mktemp -d)"
export STATE_FILE="$TMP/state.json" DATA_DIR="$TMP/pglite"
LOG="$TMP/log"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="$DATA_DIR"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$TMP"' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/journal.test.mjs" || FAIL=1
kill $PID 2>/dev/null; wait $PID 2>/dev/null
if [ -f "$STATE_FILE" ]; then
  node "$HERE/cascade.mjs" || FAIL=1
else
  echo "cascade check skipped: no state" >&2; FAIL=1
fi
out=$(npx drizzle-kit generate --name check_none 2>&1); echo "$out" | tail -3
echo "$out" | grep -qi "nothing to migrate\|No schema changes" || { echo "drizzle-kit generate reports changes"; FAIL=1; }
git clean -fdq drizzle
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
