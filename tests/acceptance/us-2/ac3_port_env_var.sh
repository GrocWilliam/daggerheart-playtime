#!/usr/bin/env bash
set -uo pipefail

# AC: "Running `node build` with PORT=4000 makes it listen on 4000:
# GET http://localhost:4000/health returns 200, and a connection attempt to
# port 8080 is refused."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
cd "$ROOT"

LOG="$(mktemp)"
(unset DATABASE_URL PGLITE_DATA_DIR; export PORT=4000; exec node build) > "$LOG" 2>&1 &
PID=$!
trap 'kill_quietly "$PID"' EXIT

if ! wait_until_http_ok "http://localhost:4000/health" 15; then
  echo "server did not answer 200 on http://localhost:4000/health in time" >&2
  echo "--- server output ---" >&2
  cat "$LOG" >&2
  exit 1
fi

if ! port_is_refused 8080; then
  echo "expected connections to port 8080 to be refused while PORT=4000, but something answered" >&2
  exit 1
fi

echo "AC3 passed: PORT=4000 serves /health on 4000, 8080 is refused"
