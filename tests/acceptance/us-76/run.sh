#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-76): form cards (surface bg, radius>=8, padding>=12); controls display:block below label,
# checkbox labels on one line; control widths (mobile = form content width, desktop <=384 except textarea);
# required border accent then danger after blocked submit; [role=alert] danger colour + 3px left border + padding;
# home error for whitespace-only name. At 375x667 and 1280x800, en and fr, on /, campaign, character.
# Existing acceptance scripts are run by CI separately.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-76"
[ -d node_modules ] || npm ci
npm run build || { echo "build failed" >&2; exit 1; }
PW="$(mktemp -d)"
(cd "$PW" && npm init -y >/dev/null && npm i playwright-core >/dev/null 2>&1) || { echo "playwright-core install failed" >&2; exit 1; }
LOG="$(mktemp)"
PORT_N=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$PW"' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PW" node --test "$HERE/forms.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
