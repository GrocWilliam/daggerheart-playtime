# daggerheart-playtime

A table companion for the Daggerheart TTRPG: campaigns with a Fear tracker, characters with trackers, conditions, gold
and inventory, and an SRD reference. English and French. Built by the forge's agents, one user story at a time.

This file is the project's memory for those agents. Keep it short, true and current: update it in the same commit as
any change that makes it wrong, and add what the next agent would otherwise rediscover the hard way.

## Stack

- SvelteKit 2 + Svelte 5 (runes), TypeScript, `@sveltejs/adapter-node`. Node 26 (`.nvmrc`, `engines`).
- Database: PostgreSQL through `pg` when `DATABASE_URL` is set, else PGlite (`PGLITE_DATA_DIR`, default `./data/pglite`;
  `memory://` in tests). Connection and migrations in `src/lib/server/db.ts`.
- All queries use `getDrizzle()` (Drizzle query builder); `sql` templates only for what the builder can't express.
  `getDb().query` stays exported for the legacy migrator and tests only: application code never calls it.
- Styling: Tailwind v4 (`@tailwindcss/vite`, tokens in `@theme static` in `src/app.css`); see `ui-style` skill.
- Validation: Zod 4 schemas + `parse(schema, body)` (`campaigns.ts`) → 400 with the first issue's message.  `parse(schema, v, 404)` for route params that 404.
- Unit tests: Vitest (`*.test.ts` next to the code). No other test or UI framework: don't add one.

## Layout

| Path | What |
|---|---|
| `src/lib/server/*.ts` | Domain logic and SQL: `campaigns.ts`, `characters.ts`, `srd.ts`. Zod input schemas live here. |
| `src/routes/api/**/+server.ts` | JSON API. Handlers are wrapped in `api(...)` and throw `ApiError(status, msg)` → `{"error": msg}`. |
| `src/routes/**/+page.server.ts` | Pages: `load` + form `actions` that call the JSON API through `fetch`, not the DB directly. |
| `src/lib/*.svelte` | Shared components (`Pips`, `Help`, `Chosen`, `LanguageSwitcher`). |
| `src/lib/i18n/{en,fr}.json` | Every UI string, by key. `translate(lang, key)`; pages get `data.lang`. |
| `src/lib/srd/` | SRD data (JSON) and its licence; `fr.json` holds the French names. |
| `src/app.css` | All global styles and the palette (CSS variables on `html`). |
| `migrations/NNN_name.sql` | Frozen legacy SQL, applied at startup (`migrate.ts`). Then `drizzle/` (drizzle-kit output, baseline `SELECT 1;`) is applied by Drizzle's migrator in `db.ts`. |
| `scripts/postbuild.mjs` | Wraps `build/index.js` so `PORT` defaults to 8080. |
| `tests/acceptance/us-N/` | Frozen acceptance tests, one folder per story. Never edit them. |

## Conventions

- Schema change = edit `src/lib/server/schema.ts` + `npx drizzle-kit generate` (see `db-migration` skill). `migrations/` is frozen legacy.
- New UI text: add the key to both `en.json` and `fr.json` (`i18n.test.ts` checks they match).
- `translate(lang, key, params?)` fills `{name}` and picks plurals from `key.one`/`key.other` when `params.count` is a number; show user-facing numbers (gold, quantities) through `formatNumber(lang, n)` (`fr` groups with U+202F: tests must not normalise with `\s`).
- No hard-coded UI text in `.svelte` files and no unused catalog keys: `src/lib/i18n/hardcoded.test.ts` fails on both. Page form errors are catalog keys (`error.invalid`, `error.notFound`, `error.server`) chosen by status in `+page.server.ts` and shown with `t(form.error)`; the API's English `error` never reaches a page. Load failures use `error(status, ...)` and `src/routes/+error.svelte` translates by status.
- Form posts must come from the same origin: `hooks.server.ts` rejects cross-site form submissions with 403.
- Styles go in `src/app.css` with the palette variables (`--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--teal`,
  `--danger`). Touch targets at least 44×44 px, teal focus outline, no sideways scroll on phones, 16px text.
- Stable `data-testid` attributes are what acceptance tests select on: keep existing ones when you restyle.

## Commands

```sh
make test                      # npm ci + vitest: what CI runs first
make build                     # npm ci + vite build + postbuild
FORGE_PREBUILT=1 bash tests/acceptance/us-79/run.sh   # one story's acceptance test, after `make build`
for s in tests/acceptance/*/run.sh; do FORGE_PREBUILT=1 bash "$s" >/dev/null 2>&1 || echo "FAIL $s"; done
PORT=8080 PGLITE_DATA_DIR=memory:// node build   # run the app; GET /health answers 200
```

Acceptance scripts start `node build` on a random free port with an in-memory PGlite, then drive it with Node's test
runner and Playwright (`PLAYWRIGHT_DIR`, `CHROMIUM_PATH` are set in the agent and CI images). Without
`FORGE_PREBUILT=1` each script rebuilds the app first, which is slow.

## Skills

How-tos for the usual work, in `.claude/skills/`: `ui-style`, `api-endpoint`, `db-migration`, `tests`. Keep them
true like this file: when a change alters a pattern a skill describes, update the skill in the same commit.

## Pitfalls

<!-- One line per trap that cost an attempt: what happened, what to do instead. -->
- Frozen tests match raw HTML and CSS with regexes: a word or colour name added anywhere can break an older story's
  test. `--teal` is written `var(--tea\6c)` and `Help.svelte` escapes "vulnerable" for that reason.
- Unlayered rules in `app.css` (global form, table, label, input rules) beat Tailwind utilities (which are layered): a utility that loses needs a trailing `!` (`aria-pressed:font-bold!`).
- The campaign page, character sheet, `Chosen` and `Pips.svelte` are pure utilities. The global `form` rule in `app.css` is a surface card, so tracker forms add `bg-transparent! p-0! rounded-none!`. `justify-self-start` computes to `flex-start`: use `[justify-self:start]`. Frozen older tests still select on `.pip`, `.filled`, `.tracker`, `ul.stats` (character sheet) and
  `.form-grid`, `ul.list` (reference page, us-78), so those are kept as marker classes via `class:name={true}` (us-100 forbids them in `class="..."`). `rounded-full`
  computes to `3.35544e+07px`: use `rounded-[50%]` where a test reads the radius.
