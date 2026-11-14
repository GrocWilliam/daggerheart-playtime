#!/usr/bin/env bash
# Criteria (US-333), documentation only (no build, no server):
# (1) docs/architecture.md equals the frozen expected text (only ## UI patterns changed), with the three replacement and five new bullets verbatim, the new ones last in order;
# (2) no old Tracker description, no color-mix(;
# (3) docs/ui.md has ## Design system after ## Layout with the required strings;
# (4) no 1.72fr / font-bold underline, Test ids lists the new ids, a Help line names the Popover API;
# (5) us-190, us-245, us-248, us-254, us-281, us-299 pass (updated frozen tests);
# (6) no file under src/ changes (checked by the forge's diff, not here).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
node --test tests/acceptance/us-333/docs.test.mjs
