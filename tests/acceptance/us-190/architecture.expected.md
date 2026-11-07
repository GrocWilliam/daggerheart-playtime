# Architecture

`CLAUDE.md` is the source for stack, layout and conventions; this file states the rules a change must not break.

## Layers and dependencies
- `src/routes/api/**/+server.ts` → `src/lib/server/features/*` → `src/lib/server/{db,schema,errors}.ts`.
- Pages (`src/routes/**/+page.server.ts`) read and write through the JSON API with `fetch`; they may import Zod schemas, pure rule helpers and SRD lookups (`getSrd`, `localizedSrd`, `pickOf`, `pickOptions`, `idByName`) from features, never queries. The home page's direct `createCampaign`/`listCampaigns` calls are the one existing exception; add no others.
- A feature never imports another feature's helpers; shared code goes to `src/lib/server/errors.ts` or the pure `src/lib/utils/`.
- Route-local pure helpers live next to their route (e.g. `campaigns/[id]/characters/new/tunnel.ts`) with a colocated test.

## SRD content and its translation
- `src/lib/server/features/srd.ts` is the only code that reads `src/lib/srd/`. English data (`core/*.json`, `adversaries.json`, `environments.json`) is upstream SRD content: never edited, never holds translations.
- French SRD text lives only in `src/lib/srd/fr/<kind>.json`, one file per kind, keyed by `getSrd` id, holding only the fields in `TRANSLATED_FIELDS[kind]` with the English element's shape (core `{"en-US": s}` leaves written as plain strings). `src/lib/srd/fr/TERMS.md` is the terminology every file follows.
- `localizedSrd(kind, id, lang)` merges French over English per top-level field and reports each field's language; a missing or misshapen field falls back to English. `getSrd` returns the merged element with the same JSON shape in both languages.
- Enumerated values (adversary/environment `type`, `tier`, `trait`, `range`, `burden`, damage type, `domain`, dice, numbers) stay English in data and are matched in English by code; they are displayed only through catalog keys. Form values and stored references use ids or English names (`idByName`), never translated names.
- Every rendered piece of SRD text carries the `lang` of the text shown (`Line = { text, lang }`, `nameLang`); no literal `lang="en"` on SRD content. The only English block on a French page is the footer licence notice (`data-testid="srd-licence"`).
- `src/lib/server/features/srd-fr.test.ts` enforces completeness and shape of the French files.

## UI patterns
- Every POST form uses `use:enhance={busy}`; `busy` also closes an enclosing `<dialog>` on success.
- Creation forms for campaign, scene, item, experience and domain card open in `src/lib/components/Modal.svelte` (`kind`, `title`, children). It renders the opener `new-<kind>` (`href="?new=<kind>"`, other params kept) and `<dialog data-testid="modal-<kind>">`, open when `?new=<kind>` or `form.modal === kind`. Actions behind a modal return `fail(status, { error: <catalog key>, modal: '<kind>', values })`. No other dialog implementation.
- Character creation is the tunnel at `/campaigns/:id/characters/new?step=1..4`: steps 1–3 are GET forms carrying values in the query string, step 4 posts to the route's `default` action, which calls `POST /api/campaigns/:id/characters`. Validation reuses `createFields`/`thresholdsOk` from `characters.ts`; errors come back as `?step=N&invalid=<field>`. No server-side draft state.
- SRD help text is shown through `src/lib/components/Help.svelte` with `lines: Line[]`.
- Inline on purpose: journal quick add, encounter Generate, loot Roll, character edit.
- Layout is mobile first with `md:` (768px) and `lg:` (1024px) only, plus `min-[600px]:` for the modal size; no `max-width` queries. Every page has no sideways scroll and 44×44 px targets at 375, 768, 1024 and 1180 px wide; nothing depends on hover.

## Data model
Unchanged by the UI: campaigns, characters (with items, experiences, cards), scenes (encounter, loot), journal entries. Stored SRD references are ids or English names. Schema changes follow `CLAUDE.md` (Drizzle, `drizzle/`, frozen `migrations/`).
