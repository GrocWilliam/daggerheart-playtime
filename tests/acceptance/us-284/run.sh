#!/usr/bin/env bash
# Criteria (US-284), pure rules in src/lib/server/features/levelup.ts, tested without a database (levelup.unit.ts):
# (1) 1 to 2 with newExperience and two one-slot picks: "1 to 2 with newExperience and two valid one-slot picks"
# (2) newExperience required at 2/5/8, refused elsewhere: "newExperience at the achievement levels only"
# (3) 4 to 5 and 7 to 8 clear marked traits: "marked traits are cleared at 5 and 8"
# (4) slot sums and proficiency: "slots and proficiency" (+ schema lengths in "levelUpBodySchema")
# (5) tier-2 evasion entry at 3 to 4 / 4 to 5: "used slots carry over tiers"
# (6) two hp picks at 4 to 5 recorded in tier 2: "lowest tier first"
# (7) hp.max 12 / 11: "trackers stay at most 12, evasion below 30, subclass needs an SRD subclass"
# (8) traits refusals: "traits must be two different unmarked traits"
# (9) experiences refusals: "experiences must be two different experiences of this character"
# (10) card refusals: "cards must be eligible and different"
# (11) unknown option multiclass: "levelUpBodySchema" (+ check order: "checks run in the stated order")
# (12) thresholds after: "thresholds after"
# (13) make test passes: `npx vitest run` below
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-284"
[ -d node_modules ] || npm ci
[ -f .svelte-kit/tsconfig.json ] || npx svelte-kit sync >/dev/null
FAIL=0
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1
npx vitest run || FAIL=1
exit $FAIL
