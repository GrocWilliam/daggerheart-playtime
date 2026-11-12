# UI guide

The single UI guide that later stories follow. It documents the current UI plus the planned changes (marked *planned*). Rules a change must not break are in [architecture.md](architecture.md); stack and conventions are in `CLAUDE.md`.

## Pages and navigation
- Home `/`: campaign list and creation.
- DM screen `/campaigns/:id?step=build|run`: `run` is the default.
- Character tunnel `/campaigns/:id/characters/new?step=1..4`.
- Character sheet `/characters/:id?tab=play|traits|gear|cards|notes` (missing or unknown `tab` → `play`, `parseTab` in `src/routes/characters/[id]/tabs.ts`).
- Level-up `/characters/:id/level-up?step=1..5`.
- Reference `/reference`.

Links between them:
- Header on every page: `nav-home` (to `/`) and `nav-reference` (to `/reference`).
- Home: each campaign has `campaign-link` (to its DM screen) and `campaign-run-link` (to `?step=run`).
- DM screen: the step switch `step-build` and `step-run`. Build's `new-character` link leads to the tunnel. Character cards link to the sheet.
- Character sheet: the tab bar `sheet-tabs` (`tab-<key>` links to `?tab=<key>`).
- Tunnel: Create (`tunnel-create`) leads to the sheet; Cancel (`tunnel-cancel`) goes back to `?step=build`.
- Character sheet: the `level-up` link (shown only below level 10 with an SRD class) leads to the level-up page. On that page `levelup-cancel` returns to the sheet and `levelup-confirm` leads to the sheet.

## Layout
- The header (sigil, nav, language switcher) stays on one row from 768px.
- Body max width: 60rem from 768px, 72rem from 1024px.
- Breakpoints: `md:` 768px, `lg:` 1024px, and `min-[600px]:` (modal only). Mobile first, no `max-width` queries.
- Forms carry no box (`form` is only `margin-bottom: 0.75rem`); only `article`, `encounter-adversary`, `loot-entry` and the Modal panel keep the card look (surface background, `3px double` accent border, `0.5rem` radius). Sheet/DM-screen/Modal `h2` use `mt-4 mb-2`; the `Divider` stays under the page `h1` only.
- One-row form (one field plus its submit): `flex flex-wrap items-end gap-2` on the `form`; a wrapping `label` is a flex item with `mb-0!` (the global `label` margin would misalign the button) and keeps its input `block`, so the button lines up with the input's bottom. Used by gold, equip selects, experience value, inventory quantity and the journal form (textarea label `flex-1`, full width below 768px).
- Target viewports (width × height): 375×812, 768×1024, 1024×768 and 1180×820.

Per page:
- Home: campaign grid with 1, 2 and 3 columns.
- Run step: see Design system. `run` has no border or padding; `fear` band first, then `party`, `current-scene` and `journal` (an `<aside>` from 1024px). With no scene, `current-scene` is one line: the text and the Build link.
- Build step: see Design system. `build` has no border or padding; `build-party` 1/3 and `build-scenes` 2/3 from 768px; each `scene` has a header row and a closed `scene-more` `<details>`.
- Run card (`character-card`): name, `down`, class and level; `ConditionBadges` only when a condition is set; the four aligned trackers; `DefenseLine`; the one-row `DamageForm`. No `Chosen` on cards (it stays on the sheet header).
- The character sheet's edit form is in `<Modal kind="edit">` (opener `new-edit` in the header next to `campaign-run-link`; no Edit section); grid 1 column, 2 from `min-[600px]:`; `edit` fails with `modal: 'edit'` and `values`, redirects 303 to `/characters/:id?tab=<tab>` on success without enhance.
- The Add scene form is in `<Modal kind="scene">` inside `build-scenes` (opener `new-scene`); its `add` action fails with `modal: 'scene'` and `values`, and redirects 303 to `?step=build` on success unless the request is an enhance one (`x-sveltekit-action`).
- Character sheet, header (every tab, above the tabs): `h1` (`character-name`, `down`), `Divider`, a meta line (class and level, `Chosen`, `domain`s, `ConditionBadges`), then a button row of `campaign-run-link`, `level-up` and `new-edit`. The Modals carry their tab: `edit` → `{ tab: data.tab }`, `item` → `gear`, `experience` → `traits`, `card` → `cards` (openers of item/experience/card sit in their tab's section).
- Character sheet, tab bar: `nav[data-testid=sheet-tabs]`, one plain link per tab (`tab-<key>`, `href="?tab=<key>"`, label `TAB_LABEL`); the current one has `aria-current="page"` and the accent look of `step-*`. Only the chosen tab is rendered (one `{#if data.tab === ...}` per tab, never hidden with CSS); `load` still computes every tab's data.
- Character sheet, panel: `sheet-panel` (surface look: `bg-surface`, `3px double` accent border, `0.5rem` radius, `p-3`) holds the `sheet-sections` grid: 1 column below 768px; from 768px 2 columns on tabs with two sections, 1 otherwise.
  - `play`: `sheet-trackers` (trackers, `DefenseLine`, `DamageForm`) left, `sheet-conditions` (the three toggles in one row of buttons) right.
  - `traits`: `sheet-traits` (one row per trait: name, `Help`, signed value) and `sheet-experiences`, side by side.
  - `gear`: `sheet-equipment` left, `sheet-gold` right, `sheet-inventory` spanning both below.
  - `cards`: `sheet-cards`. `notes`: `sheet-notes`.
- Reference: entries in 2 columns from 768px.

## Design system
Tokens:
- The palette variables `--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--teal` and `--danger` keep their values. `--border` is `--alpha(var(--accent) / 35%)` (accent at 35%), for card and field borders.
- Spacing steps are 0.25, 0.5, 0.75, 1, 1.5 and 2rem. Type sizes: body 16px, small 0.875rem (labels, meta lines), h3 1.125rem, h2 1.25rem, h1 1.5rem (1.75rem from 768px). Radius 0.25rem for controls and 0.5rem for cards.
- Checkboxes use `accent-color: var(--accent)`, are 1.25rem square, and sit inside a 44px-high label.

Buttons: every `<button>` and button-styled link has exactly one of `btn-primary` (accent background, bg text, no border), `btn-secondary` (transparent, 1px accent border, accent text), `btn-ghost` (transparent, no border, text colour) or `btn-danger` (transparent, 1px danger border, danger text). All keep 44×44px and the 2px teal `:focus-visible` outline.
- `btn-primary`: at most one per form, its main submit (Add to journal, Apply damage, Roll loot, Generate encounter, Add (battle), Save in a modal, Create/Next/Confirm in the tunnels), plus the openers of a page's main list (`new-campaign`, `new-character`, `new-scene`).
- `btn-secondary`: Set current, Mark done, condition toggles, Back in the tunnels, the other `new-*` openers, `new-edit`, `level-up`, `campaign-run-link`, `scene-edit-open`.
- `btn-ghost`: steppers (−/+ of every tracker, Fear, `unit-hp-plus`, `unit-hp-minus`), Move up, Move down, Cancel links, and the non-current language button.
- `btn-danger`: every delete or remove action.
- Toggles carry `aria-pressed`. A pressed `btn-secondary` looks primary.
- Button groups sit in `flex flex-wrap gap-2`, so no two buttons touch (at least 8px apart).
- The base `button` and `a` rules are in `@layer base`.

Trackers and help:
- `Tracker` is a `grid grid-cols-[6rem_auto_1fr] items-center gap-2` row. Column 1 is the label as `Help label`. Column 2 is a nowrap group: ghost −, the value, ghost +. Column 3 holds `Pips`. Rows are 0.25rem apart. In one container (a Run card, `sheet-trackers`), the − buttons and the pips line up within 1px.
- Fear uses `variant="band"`: surface background, 1px `--border` border, 0.5rem radius, 0.5rem 0.75rem padding, label in Cinzel, `Pips size="lg"` (1.25rem).
- `Help` takes an optional `label`. With it, `help-open` shows the label with a dotted underline instead of "?", and the label is not repeated before it. The `aria-label` stays `"<help.label> <name>"`.
- Every helper after a visible label uses `label`: tracker labels, Evasion, Thresholds, Proficiency, trait names, condition badges, `Chosen` names and the class. The `/reference` page and helpers inside prose keep "?".

Navigation:
- The header is one row at 375, 768, 1024 and 1180px: sigil, `nav-home`, `nav-reference`, then `language-switcher` at the right end. At 375px it is at most 60px tall with no sideways scroll. Below 768px the `nav-home` text may be `sr-only` (the link keeps its accessible name and 44×44px).
- `language-switcher` is two 44px buttons, 8px apart, with no padding around them. Their text is `EN` and `FR`, rendered from the language code (`code.toUpperCase()`, not catalog keys, because us-104's equal-value budget is used up). Their `aria-label` is `language.en`/`language.fr` and their `lang` is their own language. The current one is `aria-pressed="true"` with the primary look; the other is ghost.
- Tab bars (`step-*`, `sheet-tabs`): 44px-high links on a 1px `--border` bottom line, no underline. The current tab has an accent background and bg text; the others have muted text on a transparent background. At 375px `sheet-tabs` fits on one row or scrolls inside itself (`overflow-x: auto`).

Run step:
- `fear` band first. Below 1024px: `party`, then `current-scene`, then `journal` in one column. From 1024px: `lg:grid-cols-[1fr_18rem]`, with `party` left and an `<aside>` holding `current-scene` then `journal` right, starting at the same top.
- `party` is `repeat(auto-fill, minmax(18rem, 1fr))` with a 1rem gap (the spec's 20rem cannot give 3 cards at 1280px). With 3 characters that gives 1, 2, 2, 2 and 3 cards per row at 375, 768, 1024, 1180 and 1280px. The body max width is 80rem from 1280px on the Run step only.
- `character-card`: name, `down`, and class and level in small muted text; `ConditionBadges` only when a condition is set; the four aligned trackers; `DefenseLine` on one line; the one-row `DamageForm` (amount `w-[5rem]`, use armor, `btn-primary` submit). At 1024×768 a card with no condition is at most 360px tall.

Build step:
- Each `scene` `article` has a header row (`flex flex-wrap items-center gap-2`): title, `scene-status`, Set current, Mark done and `scene-edit-open`. Then come the notes and `<details data-testid="scene-more">`: closed by default, open on the current scene, with summary `scene.more` ("Loot, encounter and order" / "Butin, rencontre et ordre").
- `scene-more` holds `scene-environment`, the loot section, the encounter section, then a row: ghost Move up, ghost Move down and, at least 1rem after them, `btn-danger` Delete scene.
- One `<Modal kind="scene-edit" opener={false} clear={['scene']}>` per page (title `scene.editTitle`) is opened by `scene-edit-open` (`?step=build&new=scene-edit&scene=<id>`) and posts to `?/edit&step=build`. Its test id is `modal-scene-edit`.
- Loot and encounter forms are one row: number inputs `w-[5rem]` with `min-w-0!`, selects at most 16rem.
- `build-party` takes 1/3 and `build-scenes` 2/3 from 768px.

Character sheet:
- Header: `h1`, `Divider`, a meta line (`flex flex-wrap items-center gap-x-3`: class and level, `Chosen`, `domain`s, `ConditionBadges`), then a button row (`flex flex-wrap gap-2`) of `btn-secondary` `campaign-run-link`, `level-up` and `new-edit`.
- Condition toggles are one row of `aria-pressed` `btn-secondary` buttons.
- `traits`: one row per trait, with the name (help trigger) left and the signed value right-aligned in a fixed `3rem` column.

Other pages:
- Home: the campaign grid stays 1/2/3 columns; `campaign-name` in Cinzel; `campaign-run-link` `btn-secondary`; `new-campaign` `btn-primary`.
- Tunnel and level-up: `tunnel-progress`/`levelup-progress` are a row of numbered steps (current: accent background; done: accent text; next: muted). Next/Create/Confirm are primary, Back secondary, Cancel ghost.
- Reference: entries keep their card look and 2 columns from 768px; the entry name is in Cinzel and its kind in small muted text.
- Modals: `btn-primary` Save and `btn-ghost` `modal-cancel` side by side at the bottom.
- Footer licence: 0.75rem, muted, 2rem above it.

## Shared components
In `src/lib/components/`:
- `Divider`: the h1 flourish (`divider`).
- `Pips`: filled/empty pips for a tracker (`<name>-pips`).
- `Help`: glossary `id`, `text` prop or `lines: Line[]`, optional `label`; native Popover API: `help-open` (`popovertarget`; the label with a dotted underline, or "?") opens a `popover="auto"` `help-panel` (inline-level `<span>`) styled like the `Modal` panel, closed by Escape, an outside click or `help-close`. The one exception to `Modal` being the only dialog.
- `Chosen`: subclass, ancestry and community of a character.
- `Tracker`: one POST form per tracker (`.tracker` marker class), props `name`, `label`, `helpId`, `value`, `filled`, `max`, `action`, `hidden`, `lang`, `variant` (`band` for Fear). A 3-column grid (`6rem` label as `Help label`, nowrap ghost −/value/+, `Pips`); see Design system. Used for HP, Stress, Hope and Armor on the sheet and Run cards, and for Fear.
- `DefenseLine`: `Evasion 9 · Thresholds 7/14` on one `ul.stats` line of inline `li`s, each part with its `Help` (`evasion`, `thresholds`). Props `evasion`, `major`, `severe`, `lang`.
- `ConditionBadges`: the condition pills with their `Help` (`condition-vulnerable`, `condition-restrained`, `condition-hidden`). Props `conditions`, `lang`.
- `DamageForm`: the damage form on one row (`flex flex-wrap items-end gap-2`): amount, "use armor", submit; props `action`, `characterId?`, `lang`.
- These four import only `$lib/i18n`, `$app/forms`, `$lib/forms/busy`, `Help` and `Pips`, take `lang` and translate themselves; they never import routes.
- `LanguageSwitcher`: `language-switcher`, `lang-en`, `lang-fr`: two 44px buttons (`EN`, `FR`), the current one `aria-pressed` and primary, the other ghost.
- `Modal.svelte` (props `kind`, `title`, `lang`, optional `params: Record<string, string>` set on the opener and Cancel hrefs, `opener` (default true), `clear` (query parameters removed on close): the only dialog implementation, except the `Help` popover panel.
  - Props: `kind`, `title`, `lang`, `params`, `opener`, `clear`, children.
  - Renders the opener `new-<kind>` (`href="?new=<kind>"`, other params kept) unless `opener={false}`, and `<dialog data-testid="modal-<kind>" aria-labelledby="modal-<kind>-title">`, open when `?new=<kind>` or `form.modal === kind`.
  - The Cancel link is `data-testid="modal-cancel"`.
  - Size: full screen below 600px; from `min-[600px]:` centred, max 32rem, panel look, scrolling inside past 90dvh. Backdrop `var(--bg)` at opacity 0.8.
  - Kinds: `campaign`, `scene`, `scene-edit`, `item`, `experience`, `card`.

## Character tunnel
`/campaigns/:id/characters/new?step=1..4`. Steps 1–3 are GET forms carrying values in the query string; step 4 posts to the `default` action. Errors come back as `?step=N&invalid=<field>`.
1. Identity: name, class (must be an SRD class), level.
2. Heritage: ancestry, community (subclass *planned*).
3. Statistics: the six traits, one required select each (blank, `+2`, `+1`, `+0`, `-1`), which must use the array +2, +1, +1, +0, +0, -1 exactly (else `invalid=traits`, `tunnel.traitsArray` alert), and an armor (`armorId`, `option.none` then option groups per tier up to the level's tier, else `invalid=armorId`).
4. Review: summary of all values (traits signed, armor's localized name or `option.none`), then `tunnel-derived`: Evasion, thresholds `major/severe`, max HP, max stress and Armor computed with `derivedStats`, then Create.

Test ids: `tunnel-progress` (step indicator), `tunnel-next`, `tunnel-back`, `tunnel-cancel`, `tunnel-summary` (step 4), `tunnel-edit-1` to `tunnel-edit-3` (jump back to a step from the review), `tunnel-derived` (step 4) with `derived-evasion`, `derived-thresholds`, `derived-maxHp`, `derived-maxStress`, `derived-armorSlots`, `tunnel-create`.

## Level-up
`/characters/:id/level-up?step=1..5`, a second tunnel built like the character tunnel: GET steps carry values in the query string, step 5 posts to the `default` action, errors come back as `?step=N&invalid=<field>`.
1. Tier achievements: a required `newExperience` text input at new levels 2, 5 and 8; below those levels the text `levelup.none`.
2. Advancements: selects `pick1` and `pick2`. `proficiency` is offered only in `pick1`, and only with `pick2` blank.
3. Details: for each pick, `p1trait1`, `p1trait2`, `p1exp1`, `p1exp2`, `p1card` (and the same with `p2`, e.g. `p2exp2`). A `subclass` pick shows the subclass name and features text. `levelup.none` when nothing is needed. Options listing SRD names use `label=` attributes with empty bodies.
4. Domain card: required `domainCard` select, options grouped by domain.
5. Review: `levelup-summary` shows before and after values (the values `applyLevelUp` returns), then `levelup-confirm` submits.

Test ids: `levelup-progress` (step indicator), `levelup-next`, `levelup-back`, `levelup-cancel`, `levelup-summary`, `levelup-confirm`.

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
- Level-up: error (`?step=N&invalid=<field>` with `[role=alert]`); loading (busy submit); success (redirect to the sheet).
- Reference: static, no forms; empty sections are not shown.
- Load errors (unknown id, server) go through `+error.svelte`, which translates by status.

## Battle tracker (Run step)
Each `encounter-adversary` card of the current scene lists one `battle-unit` row per copy (one `flex flex-wrap items-center` row, wrapping below 768px) (name with copy number when count > 1, `unit-hp` `marked/max`). A live copy has a damage form (`unit-damage`, `unit-hit`); a defeated one shows `unit-defeated` and is muted. `unit-hp-plus`/`unit-hp-minus` (44px) always adjust one HP. Forms post to `?/battleDamage` and `?/battleHp`. The Build step has none. After the cards, a `battle-add` form (`battle-add-adversary` select with a blank option and one `optgroup` per tier whose options are `<option value lang label>` with empty bodies, `battle-add-count` 1–20, `battle-add-submit`) posts to `?/battleAdd` and shows only when the current scene has an encounter.

## Test ids
Stable: keep them when restyling.

Existing:
`build`, `run`, `sheet-sections`, `sheet-trackers`, `sheet-traits`, `sheet-equipment`, `sheet-experiences`, `sheet-inventory`, `sheet-cards`, `sheet-notes`, `sheet-tabs`, `tab-play`, `tab-traits`, `tab-gear`, `tab-cards`, `tab-notes`, `sheet-panel`, `sheet-conditions`, `sheet-gold`, `campaign-link`, `campaign-name`, `campaign-run-link`, `card`, `party`, `character-card`, `character-name`, `condition-hidden`, `condition-restrained`, `condition-vulnerable`, `current-scene`, `divider`, `domain`, `down`, `encounter-adversary`, `encounter-budget`, `evasion`, `experience`, `fear`, `gold`, `help`, `help-close`, `help-open`, `help-panel`, `inventory`, `item`, `item-row`, `journal`, `journal-entry`, `lang-en`, `lang-fr`, `language-switcher`, `loot-entry`, `nav-home`, `nav-reference`, `notes`, `notes-status`, `party-member`, `ref-item`, `scene`, `scene-environment`, `scene-notes`, `scene-status`, `secondary-blocked`, `sigil`, `srd-licence`, `thresholds`, `battle-unit`, `unit-hp`, `unit-defeated`, `unit-damage`, `unit-hit`, `unit-hp-plus`, `unit-hp-minus`, `battle-add`, `battle-add-adversary`, `battle-add-count`, `battle-add-submit`, `build-party`, `build-scenes`.

Dynamic: `ref-<kind>` (reference sections), `step-<k>` (`step-build`, `step-run`), `trait-<k>` (one per trait), `trait-marked-<name>` (one per marked trait), `<name>-pips` (e.g. `fear-pips`), tracker values by key (e.g. `hp`, `hope`), subclass/ancestry/community from `Chosen`, and the equipment blocks `primary-weapon`, `secondary-weapon`, `equipped-armor`.

New (*planned*):
- Sheet: `proficiency`, `subclass-stage`.
- Level-up: `level-up`, `levelup-progress`, `levelup-next`, `levelup-back`, `levelup-cancel`, `levelup-summary`, `levelup-confirm`.
- Build step: `scene-more`, `scene-edit-open`.
- Openers: `new-campaign`, `new-scene`, `new-item`, `new-experience`, `new-card`, `new-character`.
- Modals: `modal-campaign`, `modal-scene`, `modal-item`, `modal-experience`, `modal-card`, `modal-edit`, `modal-scene-edit`, `new-edit`, `modal-cancel`.
- Tunnel: `tunnel-progress`, `tunnel-next`, `tunnel-back`, `tunnel-cancel`, `tunnel-summary`, `tunnel-edit-1`, `tunnel-edit-2`, `tunnel-edit-3`, `tunnel-derived`, `derived-evasion`, `derived-thresholds`, `derived-maxHp`, `derived-maxStress`, `derived-armorSlots`, `tunnel-create`.
