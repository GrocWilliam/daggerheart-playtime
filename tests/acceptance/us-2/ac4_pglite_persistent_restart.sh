#!/usr/bin/env bash
set -uo pipefail

# AC: "Starting the server twice in a row against the same non-memory
# PGLITE_DATA_DIR (a real temp directory) succeeds both times with no error,
# even though the second run finds 001_init.sql already recorded in
# schema_migrations."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
cd "$ROOT"

DATA_DIR="$(mktemp -d)"
LOG1="$(mktemp)"
LOG2="$(mktemp)"
PID2=""

cleanup() {
  kill_quietly "$PID1"
  kill_quietly "$PID2"
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

(unset DATABASE_URL PORT; export PGLITE_DATA_DIR="$DATA_DIR"; exec node build) > "$LOG1" 2>&1 &
PID1=$!

if ! wait_until_http_ok "http://localhost:8080/health" 15; then
  echo "first run against fresh PGLITE_DATA_DIR did not become healthy" >&2
  echo "--- first run output ---" >&2
  cat "$LOG1" >&2
  exit 1
fi

kill_quietly "$PID1"
PID1=""

(unset DATABASE_URL PORT; export PGLITE_DATA_DIR="$DATA_DIR"; exec node build) > "$LOG2" 2>&1 &
PID2=$!

if ! wait_until_http_ok "http://localhost:8080/health" 15; then
  echo "second run against the same PGLITE_DATA_DIR (migrations already applied) did not become healthy" >&2
  echo "--- second run output ---" >&2
  cat "$LOG2" >&2
  exit 1
fi

echo "AC4 passed: server started twice against the same PGLITE_DATA_DIR, both became healthy"
