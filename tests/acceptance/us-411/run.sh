#!/usr/bin/env bash
# US-411 criteria -> tests in reference.test.mjs (named after each criterion):
# (1) GET /reference (en): ref-<kind> sections are <details> without open; summary = kind name + entry count
# (2) GET /reference?lang=fr: "Classes" + French-formatted count; count wording differs from en (+ catalog reference.count en != fr)
# (3) each ref-item has <details><summary> with the name and its lang; no help-open on the page (en, fr)
# (4) (browser) 1280x900: ref-classes opens alone; Bard lines inline after one click
# (5) (browser) fr adversary lines: lang="fr" translated, lang="en" untranslated
# (6) (browser) no JS: section then entry summary shows the text
# (7) (browser) 375x812 and 1280x900: summaries >= 44px, no horizontal scroll
# (8) (browser) sheet: tracker help-open opens its help-panel; card Help still shows its SRD lines
# (9) repository: SrdLines.svelte, imported by Help.svelte; docs/ui.md and CLAUDE.md updated
# Superseded frozen tests updated in their own folders (us-51, us-78, us-102, us-210, us-212, us-218, us-246, us-337...), run by their own run.sh.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-411"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test --test-timeout=300000 "$HERE/reference.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
