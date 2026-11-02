#!/usr/bin/env bash
set -uo pipefail

# AC: "`docker build -t daggerheart .` followed by
# `docker run -p 8080:8080 daggerheart` answers GET /health with 200 within
# 60 seconds of the container starting (manual/staging check; CI has no
# Docker and does not run this step itself)."
#
# CI has no Docker, so per the test plan we do not build/run the image here.
# Instead we check the two things that together make the container behave
# this way:
#   1. The Dockerfile has the shape the story describes (base image, exposed
#      port, no DATABASE_URL baked in, starts the server with `node build`).
#   2. The same runtime contract the container uses -- no DATABASE_URL, so it
#      falls back to PGlite -- actually serves GET /health with 200, by
#      starting the already-built server directly (same as the image's CMD).
# A real `docker build`/`docker run` pass is left as a manual/staging check.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
cd "$ROOT"

DOCKERFILE="$ROOT/Dockerfile"
if [ ! -f "$DOCKERFILE" ]; then
  echo "Dockerfile not found at repo root" >&2
  exit 1
fi

if ! grep -qE '^FROM[[:space:]]+node:26-bookworm' "$DOCKERFILE"; then
  echo "Dockerfile does not FROM node:26-bookworm" >&2
  exit 1
fi

if ! grep -qE '^EXPOSE[[:space:]]+8080' "$DOCKERFILE"; then
  echo "Dockerfile does not EXPOSE 8080" >&2
  exit 1
fi

if grep -qE '^ENV[[:space:]]+DATABASE_URL' "$DOCKERFILE"; then
  echo "Dockerfile must not set DATABASE_URL (image should run on PGlite)" >&2
  exit 1
fi

if ! grep -qE '^CMD.*node.*build' "$DOCKERFILE"; then
  echo "Dockerfile CMD does not appear to start the server with node build" >&2
  exit 1
fi

LOG="$(mktemp)"
(unset DATABASE_URL PORT PGLITE_DATA_DIR; exec node build) > "$LOG" 2>&1 &
PID=$!
trap 'kill_quietly "$PID"' EXIT

if ! wait_until_http_ok "http://localhost:8080/health" 15; then
  echo "server (no DATABASE_URL, same contract as the Docker image) did not answer 200 on :8080/health" >&2
  echo "--- server output ---" >&2
  cat "$LOG" >&2
  exit 1
fi

if ! json_body_is_status_ok "http://localhost:8080/health"; then
  echo "unexpected /health body" >&2
  exit 1
fi

echo "AC6 passed: Dockerfile has the expected shape, and its runtime contract (no DATABASE_URL) serves /health 200"
