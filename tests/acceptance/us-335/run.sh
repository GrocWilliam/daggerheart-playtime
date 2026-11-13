#!/usr/bin/env bash
# US-335 One-row header and EN/FR switcher. Criteria (all in header.test.mjs, at 375/768/1024/1180 px, en and fr):
# (1) one row, items vertically aligned within 8px, switcher flush with header content's right edge;
# (2) header <= 60px at 375px, no sideways scroll at 375 and 360;
# (3) nav-home accessible name "Daggerheart Playtime", >= 44x44 at 375px;
# (4) lang-en/lang-fr text, aria-label, lang, aria-pressed, variant class and colours;
# (5) buttons >= 44x44 and >= 8px apart;
# (6) clicking lang-fr switches to <html lang="fr">.
# (7) updated us-19, us-38, us-99, us-172 and the rest: run by CI over every run.sh, not here.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-335"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
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
if [ $UP -ne 1 ]; then echo "server did not start" >&2; cat "$LOG"; exit 1; fi
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/header.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $RC
