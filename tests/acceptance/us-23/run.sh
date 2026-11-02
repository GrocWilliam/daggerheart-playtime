#!/usr/bin/env bash
set -uo pipefail
# Acceptance tests for issue #23 "Run the app on Node 26".
# One test per criterion (CI has no Docker: the Dockerfile is checked by
# reading it, the server by starting `node build` directly).
D="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ROOT="$(cd "$D/../../.." && pwd)"
cd "$ROOT"
FAILED=0
for t in ac1_dockerfile ac2_engines ac3_nvmrc ac4_make_test_and_health ac5_old_test_updated; do
  echo "=== $t ==="
  if bash "$D/$t.sh"; then echo "PASS $t"; else echo "FAIL $t"; FAILED=1; fi
done
exit $FAILED
