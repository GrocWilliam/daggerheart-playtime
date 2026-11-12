#!/usr/bin/env bash
# US-281: documentation only (no build, no server, no browser).
# Criteria -> tests:
#  architecture.md: four Character rules lines after the gear line   -> docs.test.mjs
#  architecture.md: Level-up UI line after the tunnel line            -> docs.test.mjs
#  architecture.md: Data model list updated                           -> docs.test.mjs
#  architecture.md equals us-190 and us-254 frozen copies             -> docs.test.mjs (and their own docs tests below)
#  ui.md: Level-up page in the pages list, navigation                 -> docs.test.mjs
#  ui.md: ## Level-up section (steps, fields, test ids)               -> docs.test.mjs
#  ui.md: Screen states Level-up line; Test ids (planned, dynamic)    -> docs.test.mjs
#  CLAUDE.md links both docs                                          -> docs.test.mjs
#  older docs tests still pass (us-190, us-208, us-245, us-248, us-254, us-105) -> node --test below
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
FAIL=0
node --test tests/acceptance/us-281/docs.test.mjs || FAIL=1
node --test tests/acceptance/us-190/docs.test.mjs tests/acceptance/us-208/docs.test.mjs tests/acceptance/us-245/docs.test.mjs tests/acceptance/us-248/docs.test.mjs tests/acceptance/us-254/docs.test.mjs tests/acceptance/us-105/docs.test.mjs || FAIL=1
exit $FAIL
