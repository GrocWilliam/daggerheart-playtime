# daggerheart-playtime

A table companion for the Daggerheart TTRPG: campaigns with a Fear tracker, characters with trackers, conditions, gold
and inventory, and an SRD reference. English and French. Built by the forge's agents, one user story at a time.

Design docs: [docs/architecture.md](docs/architecture.md) (rules a change must not break) and [docs/ui.md](docs/ui.md) (pages, layout, components, test ids).

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
| `src/lib/server/features/*.ts` | Domain logic and queries (`campaigns.ts`, `characters.ts` (incl. traits, items, experiences), `srd.ts` (incl. adversaries/environments with `adv_`/`env_` ids, `adversariesByTier`, French overlays via `localizedSrd`; `weaponGroups`/`armorGroups`/`gearDetail` for the equipment section), `scenes.ts` (ordered scenes per campaign, dense `position`, routes under `api/campaigns/[id]/scenes`), `language.ts`), their Zod schemas with the inferred types, and colocated tests. |
| `src/lib/server/features/encounters.ts` | Encounter rules (`budgetFor`, `costOf`, `partyDefaults`, `generateRequestSchema`), the seeded `generateEncounter(input, pool)` (pure; retries random greedy picks until valid) and the scene storage functions behind `scenes/[sceneId]/encounter` (POST generate, PATCH list with `over`, DELETE, `damage` and `hp` subroutes); entries carry optional per-copy `hpMarked` (rules `damageMarks`, `marksOf`, `resizeMarks`, `maxHp` from the English SRD); writes (incl. PATCH counts, which resize marks) lock the scene row through `lockEncounter`; `addSceneAdversaries` (`POST .../encounter/adversaries`, any tier, 201) appends or grows an entry and keeps marks; `campaignPartyDefaults` reads character levels from the schema directly. |
| `src/lib/server/features/journal.ts` | Session journal entries per campaign (`journal_entries`, newest first), routes under `api/campaigns/[id]/journal`; shown in the Run step (`addJournal`/`deleteJournal` actions, `load` formats `HH:MM` server-side). |
| `src/lib/server/features/loot.ts` | Loot rolling per scene (stored in `scenes.loot`; d12 sums by rarity over SRD `items`/`consumables`), routes under `scenes/[sceneId]/loot` (incl. `[lootId]/give`, which reuses `addItem`). |
| `src/routes/campaigns/[id]/characters/new/` | The 4-step character tunnel. `tunnel.ts`: pure helpers (`TUNNEL_STEPS`, `parseStep`, `readValues`, `firstInvalid`, `tunnelHref`, `RANGES` (level only), `DEFAULTS`, `TRAIT_OPTIONS`, `characterBody`...), built on `createFields` (characters.ts, unrefined) and `pickOptions` (srd.ts). Step 3 is the six traits (`traitsFollowArray`, error field `traits`) and `armorId` (tier ≤ `tierOfLevel`); `characterBody` builds the API body with `derivedStats` (no stat fields in the URL). Steps 1–3 are GET forms (values in the query); `load` redirects 303 to the first invalid earlier step with `invalid=<field>`; the `default` action re-runs `firstInvalid(values, 3)`, then posts to the API and maps a 400 back to a step through `fieldOfMessage` (`armorId`, `traits`, else `review`). tunnel.ts imports server features, so `+page.svelte` must not import it: `load` passes `steps`, `ranges`, `defaults` and `hrefs`. |
| `src/lib/utils/prng.ts` | `seededRandom(seed)` shared seeded PRNG. |
| `src/lib/utils/trackers.ts` | `TRACKERS` and `trackerValues` (character value → `Tracker` props). |
| `src/lib/server/errors.ts` | `ApiError`, `errorResponse`, `api()`, `parse`, `readJson`. |
| `src/lib/utils/validation.ts` | Shared Zod field helpers: `strField`, `intField`, `safeIntField`, `OBJECT_ERROR`, `idSchema`. |
| `src/app.test.ts` | Tests `src/app.css` (palette). |
| `src/lib/server/schema.ts` | The Drizzle schema. `drizzle.config.ts` points drizzle-kit at it; output goes to `drizzle/`. |
| `src/lib/server/db.ts` | Connection (`getDb`, `getDrizzle`) and startup migrations. |
| `src/routes/api/**/+server.ts` | JSON API. Handlers are wrapped in `api(...)` and throw `ApiError(status, msg)` → `{"error": msg}`. |
| `src/routes/**/+page.server.ts` | Pages: `load` + form `actions` that call the JSON API through `fetch`, not the DB directly. |
| `src/routes/campaigns/[id]/` | The DM screen, `?step=build` (party with the `new-character` link to the tunnel, scenes/loot/encounters forms) or `run` (default: Fear, character cards). All actions live in its `+page.server.ts`; `src/routes/campaigns/[id]/scenario/+page.server.ts` only redirects (308) to `?step=build`. The Run step is one grid: from `md:` Fear and current scene on top, `party` (cards, 2 columns) and the journal below; from `lg:` two columns (current scene, notes and journal left; Fear and `party` right, 1 column). Build step: `build-party` (1/3) and `build-scenes` (2/3) side by side from `md:`; `nextScene` calls `POST api/campaigns/[id]/scenes/next` (`nextScene` in `scenes.ts`); `edit` patches only the fields present in the form. The `add` action fails with `fail(status, { error, modal: 'scene', values })`; with no `x-sveltekit-action` header (no JS) success redirects 303 to `?step=build`, with enhance it returns `{ ok: true }`. Build-step form actions are `?/name&step=build` so no-JS posts stay on the step (characters are created only through the tunnel `campaigns/[id]/characters/new` or the API, never by a DM-screen action). `adversaryView`, the environment mapping and `lootView` read the SRD with `localizedSrd(kind, id, lang)` in the page language and return the lang of each shown field (`nameLang`, `features[].lang`, `impulsesLang`, `attackLang`); role, environment type and damage type go through the `adversary.role.*`, `environment.type.*` and `damage.*` catalog keys, and `src/routes/campaigns/[id]/damage.ts` (`splitDamage`) splits `1d12+2 phy` into dice and a `damage.*` type. The stored English encounter `name`/`role` stay in the database. |
| `src/lib/forms/busy.ts` | `busy`, the `use:enhance` callback (submitter gets `aria-busy` + `disabled` until done). On success it also closes the form's enclosing `<dialog>`. Every POST form in the home, campaign and character pages uses `use:enhance={busy}` (scanned by `enhance.test.ts`); never add `data-sveltekit-reload` anywhere in `src` (us-178 scans it, even in tests). |
| `src/routes/characters/[id]/` | Sheet sections are `sheet-*` cells of the `sheet-sections` grid (1 col, 2 from `md:`; trackers and inventory span). Only ids listed in docs/ui.md may be added (us-190 checks). The edit form lives in `<Modal kind="edit">` (header opener `new-edit`); `edit` fails with `fail(400, { error, modal: 'edit', values })` and redirects 303 without enhance. Frozen tests open `?new=edit` before filling it. |
| `src/lib/components/*.svelte` | Shared components (`Divider` (h1 flourish, `data-testid=divider`), `Pips`, `Help`, `Chosen`, `LanguageSwitcher`, `Tracker`, `DefenseLine`, `ConditionBadges`, `DamageForm` (sheet and Run cards share them; props in docs/ui.md; `Pips row` drops its bottom margin inside a `Tracker`), `Modal` (the only `<dialog>`: opener `new-<kind>` + `<dialog data-testid=modal-<kind>>`, open on `?new=<kind>` or `form.modal === kind`; the home page's create form and the DM screen's New scene form live in one, and their failures return `fail(400, { error, modal, values })`)). `Help` uses the Popover API (a `help-open` button with `popovertarget`, a `popover="auto"` `help-panel` span, `help-close`; no click handler) and takes a glossary `id`, a `text` prop (a catalog string, e.g. `trait.help.*`) or `lines: Line[]` from `helpLines` in `srd.ts` (facts line in the page lang, text lines in `langs[field]`; SRD names render `lang={nameLang}`, never a literal `lang="en"`). |
| `src/lib/i18n/{en,fr}.json` | Every UI string, by key. `src/lib/i18n/index.ts` has the helpers; pages get `data.lang`. |
| `src/lib/srd/` | SRD data (JSON) and its licence. French names live in `src/lib/srd/fr/`, not in the English files. |
| `src/lib/srd/fr/` | One French overlay per SRD kind (`<kind>.json`: id → partial `TRANSLATED_FIELDS[kind]`, English shape, core `en-US` leaves as plain strings). `srd.ts` merges them field by field in `localizedSrd` (wrong shape → English, `langs[field] = 'en'`); `getSrd`/`listSrd` return French where translated, and `listSrd`/`adversariesByTier` add `nameLang`. The files are complete for all 13 kinds, and `srd-fr.test.ts` checks every kind and id. |
| `src/lib/srd/fr/TERMS.md` | French SRD terminology; translation stories extend it. |
| `src/app.css` | Tailwind import, palette variables, `@theme static` tokens, `@layer base` and global element rules only. |
| `migrations/` | Frozen legacy SQL files, applied first at startup. Never add, edit or rename. |
| `drizzle/` | drizzle-kit output; baseline `0000_baseline.sql` is `SELECT 1;`. |
| `scripts/postbuild.mjs` | Wraps `build/index.js` so `PORT` defaults to 8080. |
| `tests/acceptance/us-N/` | Frozen acceptance tests, one folder per story. Never edit them. |

## Conventions

### Code organisation
- `tunnel.ts` imports `src/lib` by relative path: the story-196 acceptance vitest config has no `$lib` alias.
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
- Forms carry no box (global `form` is only `margin-bottom: 0.75rem`): don't add `bg-transparent!`/`p-0!`/`rounded-none!`. Only `article`, `encounter-adversary`, `loot-entry` and the Modal panel keep the card look.
  `justify-self-start` computes to `flex-start`: use `[justify-self:start]`. `rounded-full` computes to `3.35544e+07px`:
  use `rounded-[50%]` where a test reads the radius.
- Frozen older tests still select on `.pip`, `.filled`, `.tracker`, `ul.stats` (character sheet) and `.form-grid`,
  `ul.list` (reference page, us-78): keep them as marker classes via `class:name={true}` (us-100 forbids them in `class="..."`).
- Acceptance scripts that run `drizzle-kit generate` end with `git clean -fdq drizzle`: commit the migration before running them or it is deleted.
- us-22 scans the English sheet for any differing `fr.json` value as a whole word, and English SRD names sit in its selects (e.g. "Force of Nature"): a French label like "Force" fails it, so use "Puissance".
- Never run acceptance scripts (they `git clean drizzle`) before committing a fresh `drizzle/` migration, and do not `pkill -f` anything matching your own shell command.
- us-22 whole-word scan: an English label equal to a different French value fails (en "Modifier" vs fr `section.edit`); use "Bonus" for experience.modifier.
- us-154: a scene's text must not contain its neighbours' names (tests use case-insensitive `hasText`): the edit form's environment `<option>`s use `label=` attributes with empty bodies, and env features show name + question, not the rules text (it contains "two").
- Hydration mismatches drop keyboard focus (us-172 Tab test was flaky): never put block elements (`<details>`, `<div>`) inside a `<p>`; the parser closes the `<p>` early. `Help` is inline-level only (its panel is a `popover` `<span>`). Check the browser console for `hydration_mismatch`.
- `help-open` relies on `!` utilities (`bg-transparent! text-text! p-0!`) to override the global `button` rule; tests that count or style every `button` exclude `[data-testid^="help-"]`.
- us-192/us-100: the Fear form keeps its card look (3px double border, 12px padding), so the `fear` span gets `-ml-[15px]` (border + padding) and `current-scene` gets `md:mt-[15px]` to line up with it.
- us-105 checks that every path-like token in backticks in this file exists (a bare partial path like lib/server fails): write real paths.
- PGlite start-up takes 100s+ on a loaded machine (CI, or acceptance scripts running in parallel with `make test`): keep `testTimeout`/`hookTimeout` at 120000 in `vite.config.ts`, and run acceptance scripts one at a time.
- us-143 runs `npm run check`, which type-checks `tests/`: a frozen test importing a path that only exists in a temporary copy (us-209's `fallback.unit.ts`) is excluded through `kit.typescript.config` in `svelte.config.js` (also us-218's `cards.unit.ts`, which does not type-check).
- us-104 allows at most 3 new catalog keys whose en and fr values are equal (`trait.finesse`, `trait.instinct`, `srd.help.score` use them all): give new keys distinct values (en SRD fact labels are lowercase). us-22 then fails if the English page shows a differing fr value as a whole word (hence fr `srd.field.stress` "points de stress").
- Frozen tests match raw HTML like `Rope ×2<`: don't wrap part of an `item` text in an inner element; put `lang` on the element itself.
- `make test` and `make build` both run `npm ci`: never run one (or a suite loop that calls `make build`) while the other runs, or `node_modules` breaks mid-run (`Cannot find module .../aria-query`).
