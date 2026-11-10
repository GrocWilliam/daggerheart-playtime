#!/usr/bin/env bash
# us-246: help opens in a native popover panel instead of an inline <details>.
# Criteria and tests (popover.test.mjs unless stated):
# (1) Help.svelte markup strings, no details/summary/onclick/div; Help.test.ts asserts it -> "Help.svelte renders...", "Help.test.ts asserts..." + vitest Help.test.ts
# (2) help.close = Close / Fermer; make test passes                 -> "catalog: help.close..." + vitest i18n/hardcoded/enhance/Help tests (CI runs make test)
# (3) /reference: one help-open (type=button, "?") and one help-panel per help, popovertarget = id, ids unique (also with a repeated data-help) -> "/reference: each help...", "character sheet: panel ids are unique..."
# (4) closed on load, text in the DOM                               -> "on load no help-panel is open..."
# (5) click opens; strong name first (nameLang), help-close last    -> "clicking help-open opens...", "a glossary helper on the sheet..."
# (6) closes on Escape / outside click / help-close, focus back     -> three "the panel closes ..." tests
# (7) one panel at a time (click, API)                              -> "one panel at a time..."
# (8) opening does not move the page (/reference, sheet)            -> "...opening a panel leaves scrollHeight..."
# (9) help-open inside a tracker form: no navigation, no POST       -> "sheet: a help-open inside a tracker form..."
# (10) 360 px: no sideways scroll, width/height limits, fixed       -> "... at 360 px ..."
# (11) help-open and help-close >= 44x44                             -> "help-open and help-close are each at least 44x44 px"
# (12) surface background, centred within 2 px                      -> "the open panel has the surface background..."
# (13) works without JavaScript                                     -> "without JavaScript, ..."
# (14) French name with lang, "Fermer"                              -> "fr /reference: ..."
# (15) docs/ui.md test ids + Popover API (us-190 run by CI)         -> "docs/ui.md lists..."
# (16) CLAUDE.md pitfall replaced (us-105 run by CI)                -> "CLAUDE.md drops..."
# (17) other acceptance tests pass: updated in their own folders, run by CI.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-246"
FAIL=0
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
[ -d node_modules ] || npm ci
npx vitest run src/lib/components/Help.test.ts src/lib/i18n/i18n.test.ts src/lib/i18n/hardcoded.test.ts src/lib/forms/enhance.test.ts || FAIL=1

LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
UP=0
for _ in $(seq 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && { UP=1; break; }
  sleep 0.5
done
[ $UP = 1 ] || { echo "server did not start"; cat "$LOG"; exit 1; }
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 --test-concurrency=1 "$HERE/popover.test.mjs" || { FAIL=1; echo "--- server log ---"; cat "$LOG"; }
exit $FAIL
