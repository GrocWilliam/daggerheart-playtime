---
name: tests
description: Write or run tests in daggerheart-playtime - Vitest unit tests for src/, and the acceptance tests under tests/acceptance/us-N/ (run.sh, Node test runner, Playwright). Use when adding tests, writing a story's acceptance tests, or when a test fails and you need to run or debug it.
---

# Tests

## Unit tests (dev)

- Vitest, `*.test.ts` next to the code (`src/lib/server/characters.test.ts`, `src/routes/**/page.server.test.ts`).
- Test pure functions directly: `parseX` validation (valid, each rejection, boundaries) and JSON mappers.
- Page servers: call `load` / `actions.x` with a fake `fetch` that returns a `Response` (see
  `src/routes/campaigns/[id]/page.server.test.ts`); assert what is sent to the API and what is returned.
- Database code: a real in-memory PGlite, `wrapPglite(new PGlite())` from `db.ts` (see `migrate.test.ts`). No mocks of SQL.
- `make test` runs them all (it runs `npm ci` first; `npx vitest run path` for one file).

## Acceptance tests (tester; frozen for everyone else)

Folder `tests/acceptance/us-N/`: `run.sh` + one `*.test.mjs` using `node:test` and `node:assert/strict`.
Copy the newest folder's `run.sh` and adapt it. It must:

1. `cd` to the repository root; build with `npm run build` only when `FORGE_PREBUILT` is unset.
2. Pick a free port below 32768 with the `node -e` snippet already in every `run.sh`; start
   `PORT=$PORT PGLITE_DATA_DIR=memory:// node build` with `DATABASE_URL` unset, in the background, log to a temp file.
3. Wait for `GET /health` = 200, run `node --test`, print the server log on failure, kill the server on exit.

In the test file: `BASE_URL` for HTTP; set up data through the JSON API (`POST /api/campaigns`, then characters...);
browser checks with `createRequire(process.env.PLAYWRIGHT_DIR + '/')('playwright-core')` (older tests pass it as
`PW_DIR`; never install into it) and
`chromium.launch({ executablePath: process.env.CHROMIUM_PATH })`. One `test(...)` per acceptance criterion, named after
it; list the criteria in a comment at the top of `run.sh`. Select elements by `data-testid` and roles, never by CSS
classes. Test both languages when the story shows text (`lang` cookie `en` / `fr`).

## Running and debugging

```sh
make build && FORGE_PREBUILT=1 bash tests/acceptance/us-79/run.sh     # one story
for s in tests/acceptance/*/run.sh; do FORGE_PREBUILT=1 bash "$s" >/dev/null 2>&1 || echo "FAIL $s"; done
```

A failing acceptance test after your change: read the test to see what it really checks (some match raw HTML or CSS
with regexes) and change your code, never the test. Only the tester may change `tests/acceptance/`.
