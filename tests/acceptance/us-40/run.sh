#!/usr/bin/env bash
# Criteria (tests in pips.test.mjs; browser checks at 375x667 and 1280x800, in en and fr):
# (1) hp-pips, stress-pips, hope-pips, armor-pips on each character-card and on the character sheet, fear-pips on the campaign page;
#     each has aria-hidden="true", computed font-size 16px, no text, and is absent elsewhere.
# (2) slots/filled: one .pip child per slot (hp.max, stress.max, 6, armor.max, 12), the first N (marked / hope / fear) also .filled.
# (3) a filled pip is >= 10x10 with the tracker's colour as background (hp/fear --danger, stress --accent, hope --teal, armor --muted).
# (4) an empty pip has a transparent background and a 1px border of the tracker's colour.
# (5) value text (e.g. "2/6") and the - and + buttons are unchanged; pips sit on their own line below them.
# (6) no horizontal overflow on the phone and no external (cross-origin) request.
# Builds the app, starts `node build` with PGLITE_DATA_DIR=memory:// (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-40"
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
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PW" node --test "$HERE/pips.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
