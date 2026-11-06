#!/usr/bin/env bash
# Criteria: the hardened us-157, us-79, us-126 and us-127 tests pass 3 times each (honours FORGE_PREBUILT).
# Static checks: no exact key-set check left, us-157 anchors on the name, no waitForTimeout in us-126/127.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
FAIL=0
A=tests/acceptance
if grep -nE 'deepEqual\(Object\.keys' $A/us-4/characters.test.mjs $A/us-9/items.test.mjs $A/us-95/campaigns-drizzle.test.mjs $A/us-96/characters-drizzle.test.mjs $A/us-97/items-drizzle.test.mjs $A/us-127/experiences.test.mjs; then echo "exact key-set check left" >&2; FAIL=1; fi
if grep -n 'waitForTimeout' $A/us-126/*.mjs $A/us-127/*.mjs; then echo "waitForTimeout left" >&2; FAIL=1; fi
if grep -nE 'cards\.filter\(\{ hasText: a\.name' $A/us-157/encounter-ui.test.mjs; then echo "bare hasText on name" >&2; FAIL=1; fi
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
  export FORGE_PREBUILT=1
fi
for s in us-157 us-79 us-126 us-127; do
  for i in 1 2 3; do
    bash $A/$s/run.sh >/dev/null 2>&1 || { echo "FAIL $s run $i" >&2; FAIL=1; }
  done
done
exit $FAIL
