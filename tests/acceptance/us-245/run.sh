#!/usr/bin/env bash
# Criteria (US-245), one test each in docs.test.mjs:
# (1) docs/architecture.md: the Modal bullet ends "No other dialog implementation, except help panels below." (old sentence gone)
# (2) it names popover="auto", help-open, help-panel, help-close, $props.id() and "at most 32rem wide and 80dvh high"
# (3) the old "SRD help text is shown through ... with `lines: Line[]`." bullet is gone
# (4) the inline bullet names the <details> feature lists of scenes, encounters and loot
# (5) only ## UI patterns changed in docs/architecture.md; no file under src/ or tests/ changed (outside this story)
# (6) CLAUDE.md still links docs/architecture.md
# (7) every backticked src/tests/docs/drizzle/migrations/scripts path in docs/architecture.md exists
# Documentation only: no build, no server, no browser. `make test` and the other acceptance scripts run in CI.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
node --test tests/acceptance/us-245/docs.test.mjs
