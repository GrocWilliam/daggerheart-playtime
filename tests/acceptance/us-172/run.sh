#!/usr/bin/env bash
# Criteria (US-172): forest-and-bronze palette, vignette body background, double-border panels.
# (1) html custom properties equal the seven new values; (2) text contrast >= 4.5 on bg and surface, buttons bg-on-accent text;
# (3) body background-image radial-gradient, fixed; (4) article, card form: 3px double accent, radius 8px; character-card 3px double;
# (5) h1 letter-spacing 0.05em and accent colour; (6) app.css < 150 lines, focus outline teal 2px, no sideways scroll.
# Starts `node build` with in-memory PGlite (no Docker). npm test and updated older stories are run by CI.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-172"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/palette.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
