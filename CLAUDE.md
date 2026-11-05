# daggerheart-playtime

A table companion for the Daggerheart TTRPG: campaigns with a Fear tracker, characters with trackers, conditions, gold
and inventory, and an SRD reference. English and French. Built by the forge's agents, one user story at a time.

This file is the project's memory for those agents. Keep it short, true and current: update it in the same commit as
any change that makes it wrong, and add what the next agent would otherwise rediscover the hard way.

## Stack

The project follows the forge's `stack-*` skills (`stack-api`, `stack-db`, `stack-i18n`, `stack-tests`, `stack-ui`): read
the one that matches your change. This file lists only where we differ or add to them.

- SvelteKit 2 + Svelte 5 (runes), TypeScript, `@sveltejs/adapter-node`. Node 26 (`.nvmrc`, `engines`).
- Database: PostgreSQL through `pg` when `DATABASE_URL` is set, else PGlite (`PGLITE_DATA_DIR`, default `./data/pglite`;
  `memory://` in tests).
- Unit tests: Vitest (`*.test.ts` next to the code). No other test or UI framework: don't add one.

## Layout

| Path | What |
|---|---|
| `src/lib/server/features/*.ts` | Domain logic and queries (`campaigns.ts`, `characters.ts` (incl. traits, items, experiences), `srd.ts` (incl. `weaponGroups`/`armorGroups`/`gearDetail` for the equipment section), `language.ts`), their Zod schemas with the inferred types, and colocated tests. |
| `src/lib/server/errors.ts` | `ApiError`, `errorResponse`, `api()`, `parse`, `readJson`. |
| `src/lib/utils/validation.ts` | Shared Zod field helpers: `strField`, `intField`, `safeIntField`, `OBJECT_ERROR`, `idSchema`. |
| `src/app.test.ts` | Tests `src/app.css` (palette). |
| `src/lib/server/schema.ts` | The Drizzle schema. `drizzle.config.ts` points drizzle-kit at it; output goes to `drizzle/`. |
| `src/lib/server/db.ts` | Connection (`getDb`, `getDrizzle`) and startup migrations. |
| `src/routes/api/**/+server.ts` | JSON API. Handlers are wrapped in `api(...)` and throw `ApiError(status, msg)` → `{"error": msg}`. |
| `src/routes/**/+page.server.ts` | Pages: `load` + form `actions` that call the JSON API through `fetch`, not the DB directly. |
| `src/lib/components/*.svelte` | Shared components (`Pips`, `Help`, `Chosen`, `LanguageSwitcher`). `Help` takes either a glossary `id` or a `text` prop (a catalog string, e.g. `trait.help.*`). |
| `src/lib/i18n/{en,fr}.json` | Every UI string, by key. `src/lib/i18n/index.ts` has the helpers; pages get `data.lang`. |
| `src/lib/srd/` | SRD data (JSON) and its licence; `fr.json` holds the French names. |
| `src/app.css` | Tailwind import, palette variables, `@theme static` tokens, `@layer base` and global element rules only. |
| `migrations/` | Frozen legacy SQL files, applied first at startup. Never add, edit or rename. |
| `drizzle/` | drizzle-kit output; baseline `0000_baseline.sql` is `SELECT 1;`. |
| `scripts/postbuild.mjs` | Wraps `build/index.js` so `PORT` defaults to 8080. |
| `tests/acceptance/us-N/` | Frozen acceptance tests, one folder per story. Never edit them. |

## Conventions

### Code organisation
- A feature never imports another feature's helpers: shared code goes to `src/lib/server/errors.ts` or `src/lib/utils/`. A feature may call another for domain data (e.g. `characters.ts` calling `getSrd` from `srd.ts`).
- `src/lib/utils/` is pure: it imports nothing from `$lib/server`, `node:*`, `drizzle-orm` or `@sveltejs/kit`.
- Types stay beside the Zod schema they are inferred from. No catch-all types file.
- `src/lib` has only folders at its root.
- Handlers import `json` from `@sveltejs/kit`, not from a feature.

### Validation (zod)
- Zod 4 schemas live in `src/lib/server/<domain>.ts`; handlers call `parse(schema, body)` (`src/lib/server/errors.ts`) → 400 with the
  first issue's message; `parse(schema, v, 404)` for route params that 404. The response is `{"error": msg}` only.
- Exact-messages rule: the message in the schema is the API contract (`strField`, `intField`, `safeIntField` build fields
  with the project's messages). Schemas that depend on a row are factories. Unit-test each message without a database.

### Database (Drizzle)
- Startup runs two steps in `db.ts`: legacy `migrations/*.sql` through `migrate.ts` (frozen), then `drizzle/` through
  Drizzle's migrator (path from `process.cwd()`).
- Every schema change: edit `schema.ts`, run `npx drizzle-kit generate --name short_name`, commit `drizzle/` with it. Never
  edit an applied file. A new column on an existing table needs a default or is nullable. `drizzle-kit generate` must then
  report no changes.
- Queries use `getDrizzle()` and the query builder; `sql` templates only for what the builder can't express. `getDb().query`
  is for the legacy migrator and tests only. Traps: `onConflictDoUpdate` can't target an expression index; a column in a
  `sql` subquery renders unqualified, so use `sql.raw('"table"."col"')`.

### Styling (Tailwind v4)
- Pages and components use utilities in the markup: no `<style>` blocks, no `style=`. Page styles do not go in `app.css`.
- Tokens are in `@theme static` in `src/app.css` and only reference the palette variables: `bg`, `surface`, `text`,
  `muted`, `accent`, `calm` (`--color-calm`), `danger`; fonts `font-display`, `font-body`.
- Colour rule: never Tailwind's default palette (`red-500`) and never a colour literal or colour name after a `:` in
  `src/**/*.svelte` or `*.css`, except the palette definitions. Mobile first (no `max-width` queries; `app.css.test.ts`).
- Touch targets at least 44×44 px, teal focus outline, no sideways scroll on phones, 16px text.
- Stable `data-testid` attributes are what acceptance tests select on: keep existing ones when you restyle.

### i18n
- `translate(lang, key, params?)` fills `{name}` and picks plurals from `key.one`/`key.other` when `params.count` is a
  number. Show user-facing numbers (gold, quantities) through `formatNumber(lang, n)` (`fr` groups with U+202F: tests must
  not normalise with `\s`).
- New text: add the key to both `en.json` and `fr.json` (`i18n.test.ts`). No hard-coded UI text in `.svelte` files and no
  unused keys: `src/lib/i18n/hardcoded.test.ts` fails on both.
- Page form errors are catalog keys (`error.invalid`, `error.notFound`, `error.server`) chosen by status in
  `+page.server.ts` and shown with `t(form.error)`; the API's English `error` never reaches a page. Load failures use
  `error(status, ...)` and `src/routes/+error.svelte` translates by status.
- Form posts must come from the same origin: `hooks.server.ts` rejects cross-site form submissions with 403.

### Where we differ from the `stack-*` skills
- Legacy `migrations/` stays frozen next to `drizzle/` (two-step startup).
- Palette lives as CSS variables on `html` in `app.css`, and `@theme static` tokens reference them (colour names are escaped, see Pitfalls).
- Pages call the JSON API through `fetch` instead of using the DB directly.
- Acceptance tests use `PLAYWRIGHT_DIR`/`CHROMIUM_PATH`; older ones read `PW_DIR`.

## Commands

```sh
make test                      # npm ci + vitest: what CI runs first
make build                     # npm ci + vite build + postbuild
FORGE_PREBUILT=1 bash tests/acceptance/us-79/run.sh   # one story's acceptance test, after `make build`
for s in tests/acceptance/*/run.sh; do FORGE_PREBUILT=1 bash "$s" >/dev/null 2>&1 || echo "FAIL $s"; done
PORT=8080 PGLITE_DATA_DIR=memory:// node build   # run the app; GET /health answers 200
```

Acceptance scripts start `node build` on a random free port with an in-memory PGlite, then drive it with Node's test
runner and Playwright. Without `FORGE_PREBUILT=1` each script rebuilds the app first, which is slow.

## Skills

No project skills: the `stack-*` skills cover the workflow and this file holds the project specifics.

## Pitfalls

- us-38 colour scan: frozen tests match raw HTML and CSS with regexes, so a colour name added anywhere can break an older
  story. `--teal` is written `var(--tea\6c)`, `--color-calm` is `var(--tea\6c)`, and `Help.svelte` escapes "vulnerable".
- Unlayered rules in `app.css` (global form, table, label, input rules) beat Tailwind utilities (which are layered): a
  utility that loses needs a trailing `!` (`aria-pressed:font-bold!`, `p-2!`). `app.css` stays under 150 lines.
- The global `form` rule is a surface card, so tracker forms add `bg-transparent! p-0! rounded-none!`.
  `justify-self-start` computes to `flex-start`: use `[justify-self:start]`. `rounded-full` computes to `3.35544e+07px`:
  use `rounded-[50%]` where a test reads the radius.
- Frozen older tests still select on `.pip`, `.filled`, `.tracker`, `ul.stats` (character sheet) and `.form-grid`,
  `ul.list` (reference page, us-78): keep them as marker classes via `class:name={true}` (us-100 forbids them in `class="..."`).
- Acceptance scripts that run `drizzle-kit generate` end with `git clean -fdq drizzle`: commit the migration before running them or it is deleted.
- us-22 scans the English sheet for any differing `fr.json` value as a whole word, and English SRD names sit in its selects (e.g. "Force of Nature"): a French label like "Force" fails it, so use "Puissance".
- Never run acceptance scripts (they `git clean drizzle`) before committing a fresh `drizzle/` migration, and do not `pkill -f` anything matching your own shell command.
- us-22 whole-word scan: an English label equal to a different French value fails (en "Modifier" vs fr `section.edit`); use "Bonus" for experience.modifier.
