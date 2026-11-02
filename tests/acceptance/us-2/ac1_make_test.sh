#!/usr/bin/env bash
set -uo pipefail

# AC: "On a clean Debian bookworm checkout with Node 20, make, git and python3
# available but no Postgres server and no Docker, running `make test` exits 0."
#
# We just run `make test` from the repo root (this checkout already matches
# that environment: no Postgres server, no Docker) and check its exit code.

cd "$ROOT"
make test
status=$?

if [ "$status" -ne 0 ]; then
  echo "make test exited with status $status" >&2
  exit 1
fi

echo "AC1 passed: make test exited 0"
