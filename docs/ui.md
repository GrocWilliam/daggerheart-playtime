# UI guide

The single UI guide that later stories follow. It documents the current UI plus the planned changes (marked *planned*). Rules a change must not break are in [architecture.md](architecture.md); stack and conventions are in `CLAUDE.md`.

## Pages and navigation
- Home `/`: campaign list and creation.
- DM screen `/campaigns/:id?step=build|run`: `run` is the default.
- Character tunnel `/campaigns/:id/characters/new?step=1..4`.
- Character sheet `/characters/:id`.
- Reference `/reference`.

Links between them:
- Header on every page: `nav-home` (to `/`) and `nav-reference` (to `/reference`).
- Home: each campaign has `campaign-link` (to its DM screen) and `campaign-run-link` (to `?step=run`).
- DM screen: the step switch `step-build` and `step-run`. Build's `new-character` link leads to the tunnel. Character cards link to the sheet.
- Tunnel: Create (`tunnel-create`) leads to the sheet; Cancel (`tunnel-cancel`) goes back to `?step=build`.

## Layout
- The header (sigil, nav, language switcher) stays on one row from 768px.
- Body max width: 60rem from 768px, 72rem from 1024px.
- Breakpoints: `md:` 768px, `lg:` 1024px, and `min-[600px]:` (modal only). Mobile first, no `max-width` queries.
- Target viewports (width × height): 375×812, 768×1024, 1024×768 and 1180×820.

Per page:
- Home: campaign grid with 1, 2 and 3 columns.
- Run step: below 768px one column. From 768px, Fear and `current-scene` side by side, then `party` as a 2-column grid, then `journal`. From 1024px two columns: scene, notes and journal on the left; Fear and `party` on the right, party in 1 column.
- Build step: from 768px `build-party` takes 1/3 and `build-scenes` 2/3, side by side; below that they stack.
- Character sheet: `sheet-sections` is a 2-column grid from 768px. `sheet-trackers` and `sheet-inventory` span both columns.
- Reference: entries in 2 columns from 768px.

## Shared components
In `src/lib/components/`:
- `Divider`: the h1 flourish (`divider`).
- `Pips`: filled/empty pips for a tracker (`<name>-pips`).
- `Help`: a glossary `id` or a `text` prop (a catalog string); `help`.
- `Chosen`: subclass, ancestry and community of a character.
- `LanguageSwitcher`: `language-switcher`, `lang-en`, `lang-fr`.
- `Modal.svelte` (*planned*): the only dialog implementation.
  - Props: `kind`, `title`, `lang`, children.
  - Renders the opener `new-<kind>` (`href="?new=<kind>"`, other params kept) and `<dialog data-testid="modal-<kind>" aria-labelledby="modal-<kind>-title">`, open when `?new=<kind>` or `form.modal === kind`.
  - The Cancel link is `data-testid="modal-cancel"`.
  - Size: full screen below 600px; from `min-[600px]:` centred, max 32rem, panel look, scrolling inside past 90dvh. Backdrop `var(--bg)` at opacity 0.8.
  - Kinds: `campaign`, `scene`, `item`, `experience`, `card`.

## Character tunnel
`/campaigns/:id/characters/new?step=1..4`. Steps 1–3 are GET forms carrying values in the query string; step 4 posts to the `default` action. Errors come back as `?step=N&invalid=<field>`.
1. Identity: name, class, level.
2. Heritage: ancestry, community (subclass *planned*).
3. Statistics: evasion, thresholds (must pass `thresholdsOk`), max HP, max stress, armor slots (the six traits *planned*).
4. Review: summary of all values, then Create.

Test ids: `tunnel-progress` (step indicator), `tunnel-next`, `tunnel-back`, `tunnel-cancel`, `tunnel-summary` (step 4), `tunnel-edit-1` to `tunnel-edit-3` (jump back to a step from the review), `tunnel-create`.

## Screen states
- Home: empty (no campaigns, an empty-state text); loading (the submit button is busy, `aria-busy`); error (`[role=alert]`); success (the campaign appears in the grid).
- DM screen, Build and Run: empty (no characters, no scenes, no journal entries show empty texts); loading (busy submit button with `aria-busy`); error (`[role=alert]` in the form); success (the list or tracker updates in place).
- Tunnel: empty (step 1 with blank fields); loading (busy submit); error (`?step=N&invalid=<field>` with `[role=alert]`); success (redirect to the sheet).
- Character sheet: empty (no items, experiences or cards show empty texts); loading (busy buttons); error (`[role=alert]`); success (values update in place).
- Reference: static, no forms; empty sections are not shown.
- Load errors (unknown id, server) go through `+error.svelte`, which translates by status.

## Test ids
Stable: keep them when restyling.

Existing:
`build`, `run`, `campaign-link`, `campaign-name`, `campaign-run-link`, `card`, `character-card`, `character-name`, `condition-hidden`, `condition-restrained`, `condition-vulnerable`, `current-scene`, `divider`, `domain`, `down`, `encounter-adversary`, `encounter-budget`, `evasion`, `experience`, `fear`, `gold`, `help`, `inventory`, `item`, `item-row`, `journal`, `journal-entry`, `lang-en`, `lang-fr`, `language-switcher`, `loot-entry`, `nav-home`, `nav-reference`, `notes`, `notes-status`, `party-member`, `ref-item`, `scene`, `scene-environment`, `scene-notes`, `scene-status`, `secondary-blocked`, `sigil`, `srd-licence`, `thresholds`.

Dynamic: `ref-<kind>` (reference sections), `step-<k>` (`step-build`, `step-run`), `trait-<k>` (one per trait), `<name>-pips` (e.g. `fear-pips`), tracker values by key (e.g. `hp`, `hope`), subclass/ancestry/community from `Chosen`, and the equipment blocks `primary-weapon`, `secondary-weapon`, `equipped-armor`.

New (*planned*):
- Layout: `party`, `build-party`, `build-scenes`.
- Sheet: `sheet-sections`, `sheet-trackers`, `sheet-traits`, `sheet-equipment`, `sheet-experiences`, `sheet-inventory`, `sheet-cards`, `sheet-notes`.
- Openers: `new-campaign`, `new-scene`, `new-item`, `new-experience`, `new-card`, `new-character`.
- Modals: `modal-campaign`, `modal-scene`, `modal-item`, `modal-experience`, `modal-card`, `modal-cancel`.
- Tunnel: `tunnel-progress`, `tunnel-next`, `tunnel-back`, `tunnel-cancel`, `tunnel-summary`, `tunnel-edit-1`, `tunnel-edit-2`, `tunnel-edit-3`, `tunnel-create`.
