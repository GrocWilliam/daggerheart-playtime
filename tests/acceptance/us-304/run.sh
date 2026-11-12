#!/usr/bin/env bash
# us-304 criteria, all in tabs.unit.ts (vitest; Modal is server-rendered with stubbed $app modules):
# parseTab, SHEET_TABS, actionHref, ACTION_TAB, ACTION_SECTION, TAB_LABEL, catalog keys,
# every page action mapped, tabs.ts has no import, Modal params on opener and Cancel hrefs.
# "make test passes" is enforced by CI itself.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
[ -d node_modules ] || npm ci
npx vitest run --config tests/acceptance/us-304/vitest.config.ts
