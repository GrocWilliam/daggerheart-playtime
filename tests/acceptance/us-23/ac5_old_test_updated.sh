#!/usr/bin/env bash
# AC: no acceptance test still expects node:20-bookworm; us-2 expects node:26-bookworm.
cd "$ROOT"
if grep -rn --exclude-dir=us-23 'node:20' tests/acceptance; then echo "stale node:20 reference" >&2; exit 1; fi
grep -q 'node:26-bookworm' tests/acceptance/us-2/ac6_docker_equivalent_health.sh || { echo "us-2 ac6 does not expect node:26-bookworm" >&2; exit 1; }
