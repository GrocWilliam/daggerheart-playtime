#!/usr/bin/env bash
set -uo pipefail

# AC: "Running `node build` with PORT=$P makes it listen on $P:
# GET http://localhost:$P/health returns 200, and a connection attempt to
# port 8080 is refused."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
cd "$ROOT"

P=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
LOG="$(mktemp)"
(unset DATABASE_URL PGLITE_DATA_DIR; export PORT=$P; exec node build) > "$LOG" 2>&1 &
PID=$!
trap 'kill_quietly "$PID"' EXIT

if ! wait_until_http_ok "http://localhost:$P/health" 15; then
  echo "server did not answer 200 on http://localhost:$P/health in time" >&2
  echo "--- server output ---" >&2
  cat "$LOG" >&2
  exit 1
fi

if ! port_is_refused 8080; then
  echo "expected connections to port 8080 to be refused while PORT=$P, but something answered" >&2
  exit 1
fi

echo "AC3 passed: PORT=$P serves /health on $P, 8080 is refused"
