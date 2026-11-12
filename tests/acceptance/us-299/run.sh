#!/usr/bin/env bash
# Criteria (US-299), tests in docs.test.mjs (documentation only, no build, no server):
# (1) docs/architecture.md contains the replacement modal bullet, the replacement inline bullet and the three added bullets verbatim;
# (2) the three added bullets sit right after the inline bullet, in order, under ## UI patterns and before ## Data model;
# (3) the old "loot Roll, character edit," text and the old "Creation forms for campaign, scene, item, experience and domain card open in" text are gone;
# (4) the headings are the same as before, in the same order;
# (5) the other UI patterns bullets are kept, and every section outside UI patterns is unchanged (sha256);
# (6) CLAUDE.md still links docs/architecture.md;
# (7) `make test` passes: CI runs it (vitest over src/), not repeated here.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
exec node --test tests/acceptance/us-299/docs.test.mjs
