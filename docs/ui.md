# UI guide

The single UI guide that later stories follow. It documents the current UI plus the planned changes (marked *planned*). Rules a change must not break are in [architecture.md](architecture.md); stack and conventions are in `CLAUDE.md`.

## Pages and navigation
- Home `/`: campaign list and creation.
- DM screen `/campaigns/:id?step=build|run`: `run` is the default.
- Character tunnel `/campaigns/:id/characters/new?step=1..4`.
- Character sheet `/characters/:id?tab=play|traits|gear|cards|notes` (missing or unknown `tab` → `play`, `parseTab` in `src/routes/characters/[id]/tabs.ts`).
- Reference `/reference`.

Links between them:
- Header on every page: `nav-home` (to `/`) and `nav-reference` (to `/reference`).
- Home: each campaign has `campaign-link` (to its DM screen) and `campaign-run-link` (to `?step=run`).
- DM screen: the step switch `step-build` and `step-run`. Build's `new-character` link leads to the tunnel. Character cards link to the sheet.
- Character sheet: the tab bar `sheet-tabs` (`tab-<key>` links to `?tab=<key>`).
- Tunnel: Create (`tunnel-create`) leads to the sheet; Cancel (`tunnel-cancel`) goes back to `?step=build`.

## Layout
- The header (sigil, nav, language switcher) stays on one row from 768px.
- Body max width: 60rem from 768px, 72rem from 1024px.
- Breakpoints: `md:` 768px, `lg:` 1024px, and `min-[600px]:` (modal only). Mobile first, no `max-width` queries.
- Forms carry no box (`form` is only `margin-bottom: 0.75rem`); only `article`, `encounter-adversary`, `loot-entry` and the Modal panel keep the card look (surface background, `3px double` accent border, `0.5rem` radius). Sheet/DM-screen/Modal `h2` use `mt-4 mb-2`; the `Divider` stays under the page `h1` only.
- One-row form (one field plus its submit): `flex flex-wrap items-end gap-2` on the `form`; a wrapping `label` is a flex item with `mb-0!` (the global `label` margin would misalign the button) and keeps its input `block`, so the button lines up with the input's bottom. Used by gold, equip selects, experience value, inventory quantity and the journal form (textarea label `flex-1`, full width below 768px).
- Target viewports (width × height): 375×812, 768×1024, 1024×768 and 1180×820.

Per page:
- Home: campaign grid with 1, 2 and 3 columns.
- Run step: below 768px one column. From 768px, Fear and `current-scene` side by side, then `party` as a 2-column grid, then `journal`. From 1024px two columns: scene, notes and journal on the left; Fear and `party` on the right, party in 1 column.
- Build step: from 768px `build-party` takes 1/3 and `build-scenes` 2/3, side by side; below that they stack.
- The character sheet's edit form is in `<Modal kind="edit">` (opener `new-edit` in the header next to `campaign-run-link`; no Edit section); grid 1 column, 2 from `min-[600px]:`; `edit` fails with `modal: 'edit'` and `values`, redirects 303 to `/characters/:id?tab=<tab>` on success without enhance.
- The Add scene form is in `<Modal kind="scene">` inside `build-scenes` (opener `new-scene`); its `add` action fails with `modal: 'scene'` and `values`, and redirects 303 to `?step=build` on success unless the request is an enhance one (`x-sveltekit-action`).
- Character sheet, header (every tab, above the tabs): `h1` (`character-name`, `down`), `Divider`, one line with class and level, `Chosen` and the `domain`s, `ConditionBadges`, then `campaign-run-link` and `new-edit`. The Modals carry their tab: `edit` → `{ tab: data.tab }`, `item` → `gear`, `experience` → `traits`, `card` → `cards` (openers of item/experience/card sit in their tab's section).
- Character sheet, tab bar: `nav[data-testid=sheet-tabs]`, one plain link per tab (`tab-<key>`, `href="?tab=<key>"`, label `TAB_LABEL`); the current one has `aria-current="page"` and `font-bold underline` like `step-*`. Only the chosen tab is rendered (one `{#if data.tab === ...}` per tab, never hidden with CSS); `load` still computes every tab's data.
- Character sheet, panel: `sheet-panel` (surface look: `bg-surface`, `3px double` accent border, `0.5rem` radius, `p-3`) holds the `sheet-sections` grid: 1 column below 768px; from 768px 2 columns on tabs with two sections, 1 otherwise.
  - `play`: `sheet-trackers` (trackers, `DefenseLine`, `DamageForm`) left, `sheet-conditions` (the three toggles in one row of buttons) right.
  - `traits`: `sheet-traits` (one row per trait: name, `Help`, signed value) and `sheet-experiences`, side by side.
  - `gear`: `sheet-equipment` left, `sheet-gold` right, `sheet-inventory` spanning both below.
  - `cards`: `sheet-cards`. `notes`: `sheet-notes`.
- Reference: entries in 2 columns from 768px.

## Shared components
In `src/lib/components/`:
- `Divider`: the h1 flourish (`divider`).
- `Pips`: filled/empty pips for a tracker (`<name>-pips`).
- `Help`: a glossary `id`, a `text` prop (a catalog string) or `lines: Line[]` (SRD text, each line rendered with its own `lang`; `nameLang` for the name); `help`. It uses the native Popover API: a "?" `help-open` button (`popovertarget`) opens a `popover="auto"` `help-panel` (`<span>`, inline-level markup only) styled like the `Modal` panel, closed by Escape, an outside click or `help-close`. It is the one exception to `Modal` being the only dialog.
- `Chosen`: subclass, ancestry and community of a character.
- `Tracker`: one POST form per tracker (`.tracker` marker class), props `name`, `label`, `helpId`, `value`, `filled`, `max`, `action`, `hidden` (hidden fields), `lang`. One row (`flex flex-wrap items-center gap-2`): a `flex-nowrap` group with the label, `Help`, −, the value (`<name>`) and +, then `Pips` (`<name>-pips`, the only part that may wrap). Used for HP, Stress, Hope and Armor on the sheet and on Run cards; Fear keeps its own form.
- `DefenseLine`: `Evasion 9 · Thresholds 7/14` on one `ul.stats` line of inline `li`s, each part with its `Help` (`evasion`, `thresholds`). Props `evasion`, `major`, `severe`, `lang`.
- `ConditionBadges`: the condition pills with their `Help` (`condition-vulnerable`, `condition-restrained`, `condition-hidden`). Props `conditions`, `lang`.
- `DamageForm`: the damage form on one row (`flex flex-wrap items-end gap-2`): amount, "use armor", submit; props `action`, `characterId?`, `lang`.
- These four import only `$lib/i18n`, `$app/forms`, `$lib/forms/busy`, `Help` and `Pips`, take `lang` and translate themselves; they never import routes.
- `LanguageSwitcher`: `language-switcher`, `lang-en`, `lang-fr`.
- `Modal.svelte` (props `kind`, `title`, `lang`, optional `params: Record<string, string>` set on the opener and Cancel hrefs, e.g. `{ tab: 'gear' }`): the only dialog implementation, except the `Help` popover panel.
  - Props: `kind`, `title`, `lang`, children.
  - Renders the opener `new-<kind>` (`href="?new=<kind>"`, other params kept) and `<dialog data-testid="modal-<kind>" aria-labelledby="modal-<kind>-title">`, open when `?new=<kind>` or `form.modal === kind`.
  - The Cancel link is `data-testid="modal-cancel"`.
  - Size: full screen below 600px; from `min-[600px]:` centred, max 32rem, panel look, scrolling inside past 90dvh. Backdrop `var(--bg)` at opacity 0.8.
  - Kinds: `campaign`, `scene`, `item`, `experience`, `card`.

## Character tunnel
`/campaigns/:id/characters/new?step=1..4`. Steps 1–3 are GET forms carrying values in the query string; step 4 posts to the `default` action. Errors come back as `?step=N&invalid=<field>`.
1. Identity: name, class (must be an SRD class), level.
2. Heritage: ancestry, community (subclass *planned*).
3. Statistics: the six traits, one required select each (blank, `+2`, `+1`, `+0`, `-1`), which must use the array +2, +1, +1, +0, +0, -1 exactly (else `invalid=traits`, `tunnel.traitsArray` alert), and an armor (`armorId`, `option.none` then option groups per tier up to the level's tier, else `invalid=armorId`).
4. Review: summary of all values (traits signed, armor's localized name or `option.none`), then `tunnel-derived`: Evasion, thresholds `major/severe`, max HP, max stress and Armor computed with `derivedStats`, then Create.

Test ids: `tunnel-progress` (step indicator), `tunnel-next`, `tunnel-back`, `tunnel-cancel`, `tunnel-summary` (step 4), `tunnel-edit-1` to `tunnel-edit-3` (jump back to a step from the review), `tunnel-derived` (step 4) with `derived-evasion`, `derived-thresholds`, `derived-maxHp`, `derived-maxStress`, `derived-armorSlots`, `tunnel-create`.

## Screen states
- Home: empty (no campaigns, an empty-state text); loading (the submit button is busy, `aria-busy`); error (`[role=alert]`); success (the campaign appears in the grid).
- DM screen, Build and Run: empty (no characters, no scenes, no journal entries show empty texts); loading (busy submit button with `aria-busy`); error (`[role=alert]` in the form); success (the list or tracker updates in place).
- Tunnel: empty (step 1 with blank fields); loading (busy submit); error (`?step=N&invalid=<field>` with `[role=alert]`); success (redirect to the sheet).
- Character sheet (all tabs): loading (busy buttons); error (`[role=alert]` inside the failing action's section on its tab, via `form.section` = `ACTION_SECTION[name]`; modal errors in their dialog); success (values update in place, the tab stays).
  - `play`: trackers, defense line and damage form; condition toggles show set/clear.
  - `traits`: empty (no experiences: empty list, `new-experience` opener).
  - `gear`: empty (no equipment picked: `option.none`; no items: no `inventory` table).
  - `cards`: empty (no cards: empty list, `new-card` opener).
  - `notes`: empty (blank textarea).
- Reference: static, no forms; empty sections are not shown.
- Load errors (unknown id, server) go through `+error.svelte`, which translates by status.

## Battle tracker (Run step)
Each `encounter-adversary` card of the current scene lists one `battle-unit` row per copy (name with copy number when count > 1, `unit-hp` `marked/max`). A live copy has a damage form (`unit-damage`, `unit-hit`); a defeated one shows `unit-defeated` and is muted. `unit-hp-plus`/`unit-hp-minus` (44px) always adjust one HP. Forms post to `?/battleDamage` and `?/battleHp`. The Build step has none. After the cards, a `battle-add` form (`battle-add-adversary` select with a blank option and one `optgroup` per tier whose options are `<option value lang label>` with empty bodies, `battle-add-count` 1–20, `battle-add-submit`) posts to `?/battleAdd` and shows only when the current scene has an encounter.

## Test ids
Stable: keep them when restyling.

Existing:
`build`, `run`, `sheet-sections`, `sheet-trackers`, `sheet-traits`, `sheet-equipment`, `sheet-experiences`, `sheet-inventory`, `sheet-cards`, `sheet-notes`, `sheet-tabs`, `tab-play`, `tab-traits`, `tab-gear`, `tab-cards`, `tab-notes`, `sheet-panel`, `sheet-conditions`, `sheet-gold`, `campaign-link`, `campaign-name`, `campaign-run-link`, `card`, `character-card`, `character-name`, `condition-hidden`, `condition-restrained`, `condition-vulnerable`, `current-scene`, `divider`, `domain`, `down`, `encounter-adversary`, `encounter-budget`, `evasion`, `experience`, `fear`, `gold`, `help`, `help-close`, `help-open`, `help-panel`, `inventory`, `item`, `item-row`, `journal`, `journal-entry`, `lang-en`, `lang-fr`, `language-switcher`, `loot-entry`, `nav-home`, `nav-reference`, `notes`, `notes-status`, `party-member`, `ref-item`, `scene`, `scene-environment`, `scene-notes`, `scene-status`, `secondary-blocked`, `sigil`, `srd-licence`, `thresholds`, `battle-unit`, `unit-hp`, `unit-defeated`, `unit-damage`, `unit-hit`, `unit-hp-plus`, `unit-hp-minus`, `battle-add`, `battle-add-adversary`, `battle-add-count`, `battle-add-submit`.

Dynamic: `ref-<kind>` (reference sections), `step-<k>` (`step-build`, `step-run`), `trait-<k>` (one per trait), `<name>-pips` (e.g. `fear-pips`), tracker values by key (e.g. `hp`, `hope`), subclass/ancestry/community from `Chosen`, and the equipment blocks `primary-weapon`, `secondary-weapon`, `equipped-armor`.

New (*planned*):
- Layout: `party`, `build-party`, `build-scenes`.
- Openers: `new-campaign`, `new-scene`, `new-item`, `new-experience`, `new-card`, `new-character`.
- Modals: `modal-campaign`, `modal-scene`, `modal-item`, `modal-experience`, `modal-card`, `modal-edit`, `new-edit`, `modal-cancel`.
- Tunnel: `tunnel-progress`, `tunnel-next`, `tunnel-back`, `tunnel-cancel`, `tunnel-summary`, `tunnel-edit-1`, `tunnel-edit-2`, `tunnel-edit-3`, `tunnel-derived`, `derived-evasion`, `derived-thresholds`, `derived-maxHp`, `derived-maxStress`, `derived-armorSlots`, `tunnel-create`.
