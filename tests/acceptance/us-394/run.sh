#!/usr/bin/env bash
# Criteria (US-394), documentation only (no build, no server):
# (1) docs/architecture.md `## UI patterns` has the new Layout breakpoints bullet verbatim, at the old bullet's position (4th after "Layout is mobile first");
# (2) docs/architecture.md no longer contains `body:has([data-testid=run])` nor "the Run step's 80rem body width";
# (3) docs/architecture.md equals tests/acceptance/us-190/architecture.expected.md and tests/acceptance/us-254/architecture.expected.md;
# (4) against its previous version (frozen in architecture.before.md) only that one line differs.
# us-333 (bullets.mjs, ADDED[3]) and us-190/us-254 expected copies are updated by this story; us-190, us-248, us-281, us-333 then pass.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
node --test tests/acceptance/us-394/docs.test.mjs
