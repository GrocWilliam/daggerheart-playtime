#!/usr/bin/env bash
# Criteria (US-208), one test each in docs.test.mjs:
# (1) docs/architecture.md has `## SRD content and its translation` and the strings localizedSrd(kind, id, lang),
#     TRANSLATED_FIELDS[kind], src/lib/srd/fr/TERMS.md, data-testid="srd-licence", SRD help text is shown through;
# (2) it still has `## Layers and dependencies`, `## UI patterns`, `## Data model`;
# (3) src/lib/srd/fr/TERMS.md exists, has the `| English | French |` table and the Spotlight, Countdown, Duality Dice, Bruiser rows;
# (4) src/lib/srd/LICENSE.md keeps its first two paragraphs and ends with the French-translation paragraph;
# (5) CLAUDE.md mentions src/lib/srd/fr/TERMS.md and links docs/architecture.md.
# (6) `make test` and the other acceptance tests still pass: run by CI, not repeated here.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
node --test tests/acceptance/us-208/docs.test.mjs
