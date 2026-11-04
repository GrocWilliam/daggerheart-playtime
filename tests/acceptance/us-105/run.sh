#!/usr/bin/env bash
# Criteria (US-105), one test each in docs.test.mjs:
# (1) CLAUDE.md mentions zod, drizzle-kit generate, @theme, --color-calm, translate, stack-; not ITEMS_SUBQUERY/TRACKER_SQL/parseCreate;
# (2) remaining skills contradict nothing (no stale names, existing paths, listed in CLAUDE.md; none if all deleted) and no `migrations/NNN|parseCreate` grep hit;
# (3) every file path in CLAUDE.md exists;
# (4) `make test`, `make build`, all acceptance scripts: run by CI (not repeated here).
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
node --test tests/acceptance/us-105/docs.test.mjs || exit 1
if grep -r "migrations/NNN\|parseCreate" .claude CLAUDE.md; then echo "stale reference found" >&2; exit 1; fi
