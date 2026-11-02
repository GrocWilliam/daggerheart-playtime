#!/usr/bin/env bash
# Shared helpers for the us-2 acceptance checks. Sourced by the ac*_*.sh
# scripts; not a test on its own.

# wait_until_http_ok URL [TIMEOUT_SECONDS]
# Polls URL (GET) until it answers HTTP 200, or returns 1 after the timeout.
wait_until_http_ok() {
  local url="$1" timeout="${2:-15}" elapsed=0
  while [ "$elapsed" -lt "$((timeout * 2))" ]; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$url" 2>/dev/null || true)"
    if [ "$code" = "200" ]; then
      return 0
    fi
    sleep 0.5
    elapsed=$((elapsed + 1))
  done
  return 1
}

# json_body_is_status_ok URL
# Fetches URL and checks the response body is exactly the JSON object
# {"status": "ok"} (no extra/missing keys, regardless of whitespace).
json_body_is_status_ok() {
  local url="$1"
  curl -s --max-time 5 "$url" | python3 -c '
import json, sys
try:
    data = json.loads(sys.stdin.read())
except Exception:
    sys.exit(1)
sys.exit(0 if data == {"status": "ok"} else 1)
'
}

# port_is_refused PORT
# Returns 0 if nothing accepts connections on PORT (connection refused /
# cannot connect), 1 if something answers.
port_is_refused() {
  local port="$1"
  if curl -s -o /dev/null --max-time 2 "http://localhost:$port/health" 2>/dev/null; then
    return 1
  fi
  return 0
}

# kill_quietly PID
kill_quietly() {
  local pid="${1:-}"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}
