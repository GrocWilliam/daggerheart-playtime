#!/usr/bin/env bash
# Criteria (US-98), tests in tailwind.test.mjs, one per criterion:
# (1) package.json lists tailwindcss + @tailwindcss/vite; vite.config.ts registers tailwind before sveltekit();
# (2) app.css structure: @import "tailwindcss" first, seven vars on html, @theme tokens only var(...), no colour literal,
#     --color-calm: var(--tea\6c), two font tokens, @layer base present, no tailwind default palette;
# (3) built CSS served by the app contains .text-calm or --color-calm;
# (4) visuals unchanged: body colours/fonts, 44px targets, 16px controls, teal focus, no horizontal scroll at 375 and 1280.
# Starts `node build` with in-memory PGlite (no Docker).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-98"
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
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" PW_DIR="$PLAYWRIGHT_DIR" node --test "$HERE/tailwind.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
