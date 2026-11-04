#!/usr/bin/env bash
# Criteria (US-143), one test each (layout.test.mjs, static checks of the source tree):
# (1) every file at its new path, none at the old path, src/lib has only folders ........ test 1
# (2) ApiError/errorResponse/api/parse/readJson only in server/errors.ts; field helpers
#     only in utils/validation.ts ........................................................ test 2
# (3) no feature imports those names from another feature .................................. test 3
# (4) utils/ imports no $lib/server, node:, drizzle-orm, @sveltejs/kit ..................... test 4
# (5) no import in src/ at an old path; nothing imports json from a feature ................ test 5
# (6) make test / build / npm run check / all acceptance scripts: run by CI (here: vitest + check)
# (7) CLAUDE.md describes the layout and the four rules ..................................... test 6
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-143"
[ -d node_modules ] || npm ci
FAIL=0
node --test "$HERE/layout.test.mjs" || FAIL=1
npx vitest run || FAIL=1
npm run check || FAIL=1
exit $FAIL
