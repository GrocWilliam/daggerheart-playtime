#!/usr/bin/env bash
# Criteria (US-287), all pure helpers of src/routes/characters/[id]/level-up/flow.ts, tested in flow.unit.ts:
# (1) parseStep, (2) levelUpBody, (3) firstInvalid steps 1-4, (4) stepOfField, fieldOfMessage, levelUpHref,
# (5) CLAUDE.md Layout row, (6) make test passes (vitest run of the repository suite)
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-287"
[ -d node_modules ] || npm ci
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run || FAIL=1
exit $FAIL
