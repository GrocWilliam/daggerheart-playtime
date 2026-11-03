#!/usr/bin/env bash
# Criteria (tests in helpers.test.mjs, browser with JavaScript DISABLED so "works without JS" is covered):
# (1) campaign page and sheet: each tracker/term (HP, Stress, Hope, Fear, Armor, Evasion, Thresholds,
#     Vulnerable/Restrained/Hidden badges, Gold, Level) has a <details data-testid="help" data-help="<glossary id>">;
# (2) its <summary> is "?" with aria-label "Help: <name>" / "Aide : <nom>";
# (3) summary box >= 44 x 44 px;
# (4) opened: name then glossary text in the page language (not inside lang="en");
# (5) helper sits next to its label; (6) existing data-testid values unchanged; (7) no horizontal overflow at 360px.
# Also: us-20/21/22 i18n tests updated to ignore text inside lang="en" elements (and the "?" summaries).
# SRD-element helpers belong to later stories and are not tested here.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-45"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/helpers.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
