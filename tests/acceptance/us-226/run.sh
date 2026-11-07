#!/usr/bin/env bash
# Criteria (US-226) and where they are tested:
# (1) the legacy French SRD file no longer exists: criteria.test.mjs
# (2) no file in the repository mentions its path (git history aside): criteria.test.mjs
# (3) src/lib/srd/fr/ holds 13 JSON-object overlay files with 612 name entries in total: criteria.test.mjs
# (4) the 9 listed frozen tests read src/lib/srd/fr/ and not the removed file: criteria.test.mjs
# (5) make test passes (vitest; make test is npm ci + this): `npx vitest run` below
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
HERE="$PWD/tests/acceptance/us-226"
FAIL=0

echo "== criteria.test.mjs"
node --test "$HERE/criteria.test.mjs" || FAIL=1

echo "== make test (vitest)"
[ -d node_modules ] || npm ci
npx vitest run || FAIL=1

exit $FAIL
