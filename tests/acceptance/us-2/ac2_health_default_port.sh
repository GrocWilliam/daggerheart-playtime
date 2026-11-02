#!/usr/bin/env bash
set -uo pipefail

# AC: "After `npm run build`, running `node build` with no env vars set starts
# a server; within a few seconds, GET http://localhost:8080/health returns
# status 200 and JSON body exactly {"status":"ok"}."
#
# (The build itself is produced once by run.sh before this script runs.)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
cd "$ROOT"

LOG="$(mktemp)"
(unset DATABASE_URL PORT PGLITE_DATA_DIR; exec node build) > "$LOG" 2>&1 &
PID=$!
trap 'kill_quietly "$PID"' EXIT

if ! wait_until_http_ok "http://localhost:8080/health" 15; then
  echo "server did not answer 200 on http://localhost:8080/health in time" >&2
  echo "--- server output ---" >&2
  cat "$LOG" >&2
  exit 1
fi

if ! json_body_is_status_ok "http://localhost:8080/health"; then
  echo "unexpected /health body:" >&2
  curl -s --max-time 5 "http://localhost:8080/health" >&2
  echo >&2
  exit 1
fi

echo "AC2 passed: GET http://localhost:8080/health -> 200 {\"status\":\"ok\"}"
