# Architecture

`CLAUDE.md` is the source for stack, layout and conventions; this file states the rules a change must not break.

## Layers and dependencies
- `src/routes/api/**/+server.ts` → `src/lib/server/features/*` → `src/lib/server/{db,schema,errors}.ts`.
- Pages (`src/routes/**/+page.server.ts`) read and write through the JSON API with `fetch`; they may import Zod schemas, pure rule helpers (e.g. `marksOf`, `partyDefaults`) and SRD lookups (`getSrd`, `localizedSrd`, `pickOf`, `pickOptions`, `idByName`, `adversariesByTier`, `armorGroups`) from features, never queries. The home page's direct `createCampaign`/`listCampaigns` calls are the one existing exception; add no others.
- A feature never imports another feature's helpers; shared code goes to `src/lib/server/errors.ts` or the pure `src/lib/utils/`.
- Route-local pure helpers live next to their route (e.g. `campaigns/[id]/characters/new/tunnel.ts`) with a colocated test.

## Character rules
- Game rules for characters are pure functions in `src/lib/server/features/characters.ts`, unit-tested without a database: `tierOfLevel`, `thresholdsOk`, `armorStats` (armor or unarmored), `armorEvasionModifier`, `TRAIT_ARRAY`/`traitsFollowArray`, `classStart`, `derivedStats`, `gearTierIssue`, `recomputeOnPatch`.
- Class starting values (Evasion, HP) and armor values are read from the SRD by id or English name; never copied into code.
- `POST /api/campaigns/:id/characters` stores what it is given (plus an optional tier-checked `armorId`); it computes nothing. The tunnel computes the numbers with `derivedStats` and the review shows the same values it sends.
- `PATCH /api/characters/:id` recomputes thresholds, Armor and the armor's Evasion modifier through `recomputeOnPatch` when `armorId` or `level` changes; an explicit value in the same request always wins. Max HP and Evasion are never recomputed from level or class.
- POST and PATCH share gear validation and its error texts (`gearField`, `gearTierIssue`).

## SRD content and its translation
- `src/lib/server/features/srd.ts` is the only code that reads `src/lib/srd/`. English data (`core/*.json`, `adversaries.json`, `environments.json`) is upstream SRD content: never edited, never holds translations.
- French SRD text lives only in `src/lib/srd/fr/<kind>.json`, one file per kind, keyed by `getSrd` id, holding only the fields in `TRANSLATED_FIELDS[kind]` with the English element's shape (core `{"en-US": s}` leaves written as plain strings). `src/lib/srd/fr/TERMS.md` is the terminology every file follows.
- `localizedSrd(kind, id, lang)` merges French over English per top-level field and reports each field's language; a missing or misshapen field falls back to English. `getSrd` returns the merged element with the same JSON shape in both languages.
- Enumerated values (adversary/environment `type`, `tier`, `trait`, `range`, `burden`, damage type, `domain`, dice, numbers, armor feature names) stay English in data and are matched in English by code; they are displayed only through catalog keys. Form values and stored references use ids or English names (`idByName`), never translated names.
- Every rendered piece of SRD text carries the `lang` of the text shown (`Line = { text, lang }`, `nameLang`); no literal `lang="en"` on SRD content. The only English block on a French page is the footer licence notice (`data-testid="srd-licence"`).
- `src/lib/server/features/srd-fr.test.ts` enforces completeness and shape of the French files.

## Encounters and battle tracking
- `src/lib/server/features/encounters.ts` owns everything stored in `scenes.encounter`: generation, budget (`evaluate`), counts, and battle state. Routes under `api/campaigns/[id]/scenes/[sceneId]/encounter`: `POST`/`PATCH`/`DELETE` on the encounter, `POST damage` (`{adversaryId, index, amount}` → `{hpHit, encounter}`), `POST hp` (`{adversaryId, index, delta}` → encounter), `POST adversaries` (`{adversaryId, count}` → 201 encounter).
- Every write that reads the stored encounter first locks the scene row (`.for('update')` in a transaction).
- `EncounterEntry.hpMarked?: number[]` holds marked HP per copy (`length === count`, each in `0..hp`). Absent means all zeros; it is written only when a copy is first marked, so unmarked encounters keep their JSON. Count changes (`PATCH`, `POST adversaries`) cut or pad it with zeros (`resizeMarks`); regeneration resets it. A copy is defeated when marked equals the SRD `hp`.
- HP maximum and damage thresholds are read from the English SRD at request time (`getAdversary(id, 'en')`), never copied into the stored entry. `damageMarks(amount, thresholds)` is the only damage-to-HP rule.
- The Build step edits counts; battle tracking (damage, ±1 HP, adding adversaries) is on the Run step only.

## UI patterns
- Every POST form uses `use:enhance={busy}` and works without JavaScript; `busy` also closes an enclosing `<dialog>` on success.
- Creation forms for campaign, scene, item, experience and domain card open in `src/lib/components/Modal.svelte` (`kind`, `title`, children). It renders the opener `new-<kind>` (`href="?new=<kind>"`, other params kept) and `<dialog data-testid="modal-<kind>">`, open when `?new=<kind>` or `form.modal === kind`. Actions behind a modal return `fail(status, { error: <catalog key>, modal: '<kind>', values })`. No other dialog implementation.
- Character creation is the tunnel at `/campaigns/:id/characters/new?step=1..4`: steps 1–3 are GET forms carrying values in the query string (step 3: the six traits and `armorId`), step 4 posts to the route's `default` action, which re-validates and calls `POST /api/campaigns/:id/characters` with the numbers from `derivedStats`. Validation lives in `firstInvalid` (reusing `createFields`, `classStart`, `traitsFollowArray`, `tierOfLevel`); errors come back as `?step=N&invalid=<field>` (`traits` names the whole trait group). Everything works without JavaScript. No server-side draft state.
- SRD help text is shown through `src/lib/components/Help.svelte` with `lines: Line[]`.
- Inline on purpose: journal quick add, encounter Generate, loot Roll, character edit, battle damage/HP/add on the Run step.
- Selects listing SRD names on the DM screen use `<option value={id} lang={nameLang} label={name}></option>` (empty body), so page text never contains other adversaries' or environments' names.
- Layout is mobile first with `md:` (768px) and `lg:` (1024px) only, plus `min-[600px]:` for the modal size; no `max-width` queries. Every page has no sideways scroll and 44×44 px targets at 360, 375, 768, 1024 and 1180 px wide; nothing depends on hover.

## Data model
Campaigns, characters (with items, experiences, cards), scenes (encounter jsonb including per-copy `hpMarked`, loot jsonb), journal entries. Stored SRD references are ids or English names. Schema changes follow `CLAUDE.md` (Drizzle, `drizzle/`, frozen `migrations/`); jsonb shape changes need no migration but must keep older stored values readable (new fields optional, absent = default).
