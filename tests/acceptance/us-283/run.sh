#!/usr/bin/env bash
# Criteria (US-283), all pure rules in src/lib/server/features/levelup.ts, tested without a database (levelup.unit.ts):
# (1) SLOTS and SLOT_COST equal the table: "SLOTS and SLOT_COST equal the table" (+ slotsLeft)
# (2) level 1 SRD character -> plan to level 2: "level 1 SRD character: the plan to level 2"
# (3) subclass/proficiency only from level 4 (to 5), proficiency slots 2: "subclass and proficiency appear from level 4"
# (4) tier-2 evasion entry: absent at level 3, slotsLeft 1 at level 4: "used slots carry over tiers"
# (5) hp.max / stress.max 12 hide hp / stress: "hp and stress are hidden at their maximum of 12"
#     (+ the other effect conditions: "other options need an effect that can apply")
# (6) marked traits and the 5/8 clearing: "marked traits and the 5/8 clearing"
# (7) level 10 and non-SRD class messages: "refusals"
# (8) thresholdsAfter: "thresholdsAfter"
# (9) eligibleCards: "eligibleCards"
# (10) make test passes: `npx vitest run` below (plus the colocated levelup.test.ts and CLAUDE.md row: "module layout")
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-283"
[ -d node_modules ] || npm ci
[ -f .svelte-kit/tsconfig.json ] || npx svelte-kit sync >/dev/null
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run || FAIL=1
exit $FAIL
