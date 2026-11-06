#!/usr/bin/env bash
# Criteria (documentation only; tests in docs.test.mjs, no server needed):
# 1 docs/architecture.md equals the specified block (architecture.expected.md), ignoring trailing whitespace
# 2 docs/ui.md has the six ## headings, in order
# 3 docs/ui.md contains the required strings
# 4 every static data-testid in src/**/*.svelte appears in docs/ui.md
# 5 CLAUDE.md links docs/architecture.md and docs/ui.md
# 6 no file under src/ changes (vs main); make test (vitest) passes
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
[ -d node_modules ] || npm ci
FAIL=0
node --test tests/acceptance/us-190/docs.test.mjs || FAIL=1
npx vitest run || FAIL=1
exit $FAIL
