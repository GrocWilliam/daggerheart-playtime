#!/usr/bin/env bash
# Criteria (tests in enhance.test.mjs):
# 1 with JS, fear/tracker/damage/add scene/journal/add character forms (DM screen and character page) update in place: marker kept, 1 navigation entry, new value in DOM
# 2 slow submit: clicked button aria-busy=true + disabled, both gone afterwards
# 3 scrollY kept after a submit
# 4 form error (blank scene title / blank campaign name) shows the same text without reload
# 5 creating a campaign ends at /campaigns/<id>?step=build with the marker
# 6 without JS the forms still work as full-page POSTs
# 7 source scan: every <form method="POST"> in the three pages has use:enhance; no data-sveltekit-reload in src
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-178"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/enhance.test.mjs" || FAIL=1
[ $FAIL -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $FAIL
