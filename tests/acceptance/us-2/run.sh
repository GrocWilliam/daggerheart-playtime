#!/usr/bin/env bash
set -uo pipefail

# Acceptance tests for issue #2: "Project scaffold: build, DB layer,
# migrations, health check, Docker". One script per acceptance criterion:
#
#   ac1_make_test.sh                  - `make test` exits 0 (no Postgres/Docker)
#   ac2_health_default_port.sh        - `node build` serves /health on :8080
#   ac3_port_env_var.sh               - PORT=4000 is honored, :8080 refused
#   ac4_pglite_persistent_restart.sh  - restart against same PGLITE_DATA_DIR is idempotent
#   ac5_db_module_direct_query.sh     - db module usable directly, in-memory
#   ac6_docker_equivalent_health.sh   - Dockerfile shape + its runtime contract
#
# Run from the repository root: bash tests/acceptance/us-2/run.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT"

FAILED=0
RESULTS=()

run_check() {
  local name="$1" script="$2"
  echo "=== $name ==="
  if bash "$script"; then
    RESULTS+=("PASS  $name")
  else
    RESULTS+=("FAIL  $name")
    FAILED=1
  fi
  echo
}

run_check "AC1 make-test"               "$SCRIPT_DIR/ac1_make_test.sh"

# AC2/AC3/AC4/AC6 all run the already-built server with `node build`; build once.
echo "=== build (npm run build) ==="
if [ -n "${FORGE_PREBUILT:-}" ] || (cd "$ROOT" && npm run build); then
  BUILD_OK=1
else
  BUILD_OK=0
  FAILED=1
  RESULTS+=("FAIL  build (npm run build) -- required by AC2/AC3/AC4/AC6")
fi
echo

if [ "$BUILD_OK" -eq 1 ]; then
  run_check "AC2 health-default-port"      "$SCRIPT_DIR/ac2_health_default_port.sh"
  run_check "AC3 port-env-var"             "$SCRIPT_DIR/ac3_port_env_var.sh"
  run_check "AC4 pglite-persistent-restart" "$SCRIPT_DIR/ac4_pglite_persistent_restart.sh"
  run_check "AC6 docker-equivalent-health"  "$SCRIPT_DIR/ac6_docker_equivalent_health.sh"
else
  RESULTS+=("SKIP  AC2 health-default-port (build failed)")
  RESULTS+=("SKIP  AC3 port-env-var (build failed)")
  RESULTS+=("SKIP  AC4 pglite-persistent-restart (build failed)")
  RESULTS+=("SKIP  AC6 docker-equivalent-health (build failed)")
fi

run_check "AC5 db-module-direct-query" "$SCRIPT_DIR/ac5_db_module_direct_query.sh"

echo "=========================="
printf '%s\n' "${RESULTS[@]}"
echo "=========================="

exit "$FAILED"
