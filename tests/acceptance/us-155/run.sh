#!/usr/bin/env bash
# Criteria: budgets (14/16/11/5), automatic twoSolos/noBigThreats, costs, partyDefaults, exact request messages.
# Pure logic: Vitest only, no server or database. Assumes adversaries are passed as {role, count} objects.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
[ -d node_modules ] || npm ci
npx vitest run --config tests/acceptance/us-155/vitest.config.mjs
