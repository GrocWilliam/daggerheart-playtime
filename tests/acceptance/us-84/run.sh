#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-84), one test each in setup.test.mjs (static checks of the acceptance scripts and Makefile):
# (1) no RANDOM / listen(0) port choice; servers get a port in 10000-32767;
# (2) no `npm i playwright-core`; scripts pass PW_DIR="$PLAYWRIGHT_DIR" and never rm it;
# (3) `make build` = npm ci + npm run build; with FORGE_PREBUILT set no run.sh runs `npm run build`.
# (4) "every run.sh passes in sequence" is what CI itself does; not re-run here to avoid recursion.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD" node --test tests/acceptance/us-84/setup.test.mjs
