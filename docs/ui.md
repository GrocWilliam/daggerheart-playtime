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
- Home: each campaign card is one whole-card `campaign-link` (to its DM screen) holding `campaign-name` and `campaign-meta` (small muted line: characters count · current scene or none · last journal date).
- DM screen: the step switch `step-build` and `step-run`. Build's `new-character` link leads to the tunnel. Character cards link to the sheet.
- Character sheet: the tab bar `sheet-tabs` (`tab-<key>` links to `?tab=<key>`).
- Tunnel: Create (`tunnel-create`) leads to the sheet; Cancel (`tunnel-cancel`) goes back to `?step=build`.
- Character sheet: the `level-up` link (shown only below level 10 with an SRD class) leads to the level-up page. On that page `levelup-cancel` returns to the sheet and `levelup-confirm` leads to the sheet.

## Layout
- The header (sigil, nav, language switcher) stays on one row from 768px.
- Body max width: 60rem from 768px, 72rem from 1024px on every page. `run` is 77rem (`-mx-16`) from 1280px.
- Breakpoints: `md:` 768px, `lg:` 1024px, and `min-[600px]:` (modal only). Mobile first, no `max-width` queries.
- Forms carry no box (`form` is only `margin-bottom: 0.75rem`); only `article`, `encounter-adversary`, `loot-entry` and the Modal panel keep the card look (surface background, `3px double` accent border, `0.5rem` radius). Sheet/DM-screen/Modal `h2` use `mt-4 mb-2`; the `Divider` stays under the page `h1` only.
- One-row form (one field plus its submit): `flex flex-wrap items-end gap-2` on the `form`; a wrapping `label` is a flex item with `mb-0!` (the global `label` margin would misalign the button) and keeps its input `block`, so the button lines up with the input's bottom. Used by gold, equip selects, experience value, inventory quantity and the journal form (textarea label `flex-1`, full width below 768px).
- Target viewports (width × height): 375×812, 768×1024, 1024×768 and 1180×820.

Per page:
- Home: campaign grid with 1, 2 and 3 columns.
- Run step: see Design system. `run` has no border or padding; `fear` band first, then `party`, `current-scene` and `journal` (its add form comes right under the `h2`, before the entries; an `<aside>` from 1024px). With no scene, `current-scene` is one line: the text and the Build link.
- Build step: see Design system. `build` has no border or padding; `build-party` 1/3 and `build-scenes` 2/3 from 768px; each `scene` has a header row and a closed `scene-more` `<details>`.
- Run card (`character-card`): name and `down` on line 1, class (through `chosen.class`, `localizedSrd`) and level on their own line below ("Guardian · level 10"); no level `Help`; `ConditionBadges` only when a condition is set; the four aligned trackers; `DefenseLine`; the two-row `DamageForm`. No `Chosen` on cards (it stays on the sheet header).
- The character sheet's edit form is in `<Modal kind="edit">` (opener `new-edit` in the header next to `campaign-run-link`; no Edit section); grid 1 column, 2 from `min-[600px]:`; `edit` fails with `modal: 'edit'` and `values`, redirects 303 to `/characters/:id?tab=<tab>` on success without enhance.
- The Add scene form is in `<Modal kind="scene">` inside `build-scenes` (opener `new-scene`); its `add` action fails with `modal: 'scene'` and `values`, and redirects 303 to `?step=build` on success unless the request is an enhance one (`x-sveltekit-action`).
- Character sheet, header (every tab, above the tabs; no back link above the `h1`; the run link is the way back): `h1` (`character-name`, `down`), `Divider`, a meta line (class and level, `Chosen`, `domain`s, `ConditionBadges`), then a button row of `level-up` (`btn-primary`, first, only when `canLevelUp`), `campaign-run-link` and `new-edit` (both `btn-secondary`); `whitespace-nowrap` and tight padding keep it on one line at 375px. The Modals carry their tab: `edit` → `{ tab: data.tab }`, `item` → `gear`, `experience` → `traits`, `card` → `cards` (openers of item/experience/card sit in their tab's section).
- Character sheet, tab bar: `nav[data-testid=sheet-tabs]`, one plain link per tab (`tab-<key>`, `href="?tab=<key>"`, label `TAB_LABEL`); the current one has `aria-current="page"` and the accent look of `step-*`. Only the chosen tab is rendered (one `{#if data.tab === ...}` per tab, never hidden with CSS); `load` still computes every tab's data.
- Character sheet, panel: `sheet-panel` (surface look: `bg-surface`, `3px double` accent border, `0.5rem` radius, `p-3`) holds the `sheet-sections` grid: 1 column below 768px; from 768px 2 columns on traits and gear, 1 otherwise (Play included).
  - `play` (Play tab): one column at every width: `sheet-trackers` (trackers, then a `flex flex-wrap items-center gap-x-4` row of `DefenseLine` and `proficiency`, then the two-row `DamageForm` and `damage-result`), with `sheet-conditions` (the three toggles in one `flex flex-wrap gap-2` row) below it.
  - `traits`: `sheet-traits` (one row per trait: name, `Help`, signed value) and `sheet-experiences`, side by side.
  - `gear`: `sheet-equipment` left, `sheet-gold` right, `sheet-inventory` spanning both below. Equipment selects save on change (`requestSubmit`); with JavaScript the Equip button is `sr-only` (visible without JS). Gold: the heading is an `<h2>` holding `Help` with `label` "Gold"; ghost − / + steppers per unit (`gold-<unit>-minus|plus`, ±1, ±10, ±100 handfuls) above the free handfuls form.
  - `cards`: `sheet-cards`. `notes`: `sheet-notes`.
- Reference: the GET filter form (kind, `q`, Filter), then one `<details data-testid="ref-<kind>">` per section, closed by default, whose `<summary>` is the kind name (`h2`) and the entry count (`reference.count`, `formatNumber`). Each entry is `<li data-testid="ref-item"><details>` (closed by default): its `<summary>` holds the name (Cinzel, `lang={nameLang}`) and the kind; below it the entry's lines render inline through `SrdLines`. With JavaScript the `q` input filters as you type (`src/lib/utils/search.ts`: `fold` strips accents and case, `matches` checks name, line text and label): non-matching entries and sections are `hidden`, and while the query is not empty each section's `open` follows "has matches" (cleared: back to the user's own state). A row of `ref-chip-<kind>` buttons (`btn-secondary`, `aria-pressed`, only after `onMount`) shows only the pressed kinds (union; none pressed = all). The no-JS GET form stays name-only and server-renders its sections open when `q` is set (JavaScript closes them again on mount); the Filter button is `self-end min-h-11`, as tall as the input. No `Help` on Reference. Entries in 2 columns from 768px; every summary is at least 44px high.

## Design system
Tokens:
- The palette variables `--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--teal` and `--danger` keep their values. `--border` is `--alpha(var(--accent) / 35%)` (accent at 35%), for card and field borders.
- Spacing steps are 0.25, 0.5, 0.75, 1, 1.5 and 2rem. Type sizes: body 16px, small 0.875rem (labels, meta lines), h3 1.125rem, h2 1.25rem, h1 1.5rem (1.75rem from 768px). Radius 0.25rem for controls and 0.5rem for cards.
- Checkboxes use `accent-color: var(--accent)`, are 1.25rem square, and sit inside a 44px-high label.

Buttons: every `<button>` and button-styled link has exactly one of `btn-primary` (accent background, bg text, no border), `btn-secondary` (transparent, 1px accent border, accent text), `btn-ghost` (transparent, no border, text colour) or `btn-danger` (transparent, 1px danger border, danger text). All keep 44×44px and the 2px teal `:focus-visible` outline.
- `btn-primary`: at most one per form, its main submit (Add to journal, Apply damage, Roll loot, Generate encounter, Add (battle), Save in a modal, Create/Next/Confirm in the tunnels), plus the openers of a page's main list (`new-campaign`, `new-character`, `new-scene`) and the sheet's `level-up`. The quick damage buttons (`damage-minor`, `damage-major`, `damage-severe`) are `btn-secondary`.
- `btn-secondary`: Set current, Mark done, condition toggles, Back in the tunnels, the other `new-*` openers, `new-edit`, `campaign-run-link` (character sheet only), `scene-edit-open`.
- `btn-ghost`: steppers (−/+ of every tracker, Fear, `unit-hp-plus`, `unit-hp-minus`), Move up, Move down, Cancel links, and the non-current language button.
- `btn-danger`: every delete or remove action.
- Toggles carry `aria-pressed`. A pressed `btn-secondary` looks primary.
- Button groups sit in `flex flex-wrap gap-2`, so no two buttons touch (at least 8px apart).
- The base `button` and `a` rules are in `@layer base`.

Trackers and help:
- `Tracker` is a `grid grid-cols-[6rem_auto_1fr] items-center` grid. The `row` variant has two lines (`gap-x-2 gap-y-1`): line 1 is the label as `Help label` in column 1 and a nowrap group (ghost −, the value, ghost +) in column 2; line 2 is `Pips` (`col-span-full`), starting at the label's left edge, so the pips sit below the − button. Fear (`variant="band"`) stays on one line at every width (label, stepper, pips); its label column is `auto` below 768px and 6rem from 768px. In one container (a Run card, `sheet-trackers`), the − buttons line up within 1px, and so do the pips and the labels.
- Fear uses `variant="band"`: surface background, 1px `--border` border, 0.5rem radius, 0.5rem 0.75rem padding (0.25rem 0.5rem below 768px), label in Cinzel; sticky (`top-0 z-10`) at the top of the Run step on a surface background; at most 60px tall at 375px; `Pips size="band"`: 0.625rem pips with a 0.125rem gap below 768px, 1.25rem with a 0.25rem gap from 768px.
- `Help` takes an optional `label`. With it, `help-open` shows the label with a dotted underline instead of "?", and the label is not repeated before it. The `aria-label` stays `"<help.label> <name>"`.
- Every helper after a visible label uses `label`: tracker labels, Evasion, Thresholds, Proficiency, trait names, condition badges, `Chosen` names and the class. Helpers inside prose keep "?".

Navigation:
- The header is one row at 375, 768, 1024 and 1180px: sigil, `nav-home`, `nav-reference`, then `language-switcher` at the right end. At 375px it is at most 60px tall with no sideways scroll. Below 768px the `nav-home` text may be `sr-only` (the link keeps its accessible name and 44×44px). The `<header>` has no `justify-between`: the switcher's `ml-auto` keeps it at the right end, and below 768px the nav sits right after the sigil (left-aligned).
- `language-switcher` is two 44px buttons, 8px apart, with no padding around them. Their text is `EN` and `FR`, rendered from the language code (`code.toUpperCase()`, not catalog keys, because us-104's equal-value budget is used up). Their `aria-label` is `language.en`/`language.fr` and their `lang` is their own language. The current one is `aria-pressed="true"` with the primary look; the other is ghost.
- Tab bars (`step-*`, `sheet-tabs`): 44px-high links on a 1px `--border` bottom line, no underline. The current tab has an accent background and bg text; the others have muted text on a transparent background. At 375px `sheet-tabs` fits on one row or scrolls inside itself (`overflow-x: auto`). While `sheet-tabs` can scroll further right, an `aria-hidden` `pointer-events-none` span (2rem wide, full height, gradient from transparent to `--bg`) fades its right edge; it is absent otherwise and without JavaScript (computed on mount, on `scroll` and by a `ResizeObserver`).

Run step:
- `fear` band first. Below 1024px: `party`, then `current-scene`, then `journal` in one column. From 1024px: `lg:grid-cols-[1fr_18rem]`, with `party` left and an `<aside>` holding `current-scene` then `journal` right, starting at the same top.
- `party` is `repeat(auto-fill, minmax(18rem, 1fr))` with a 1rem gap (the spec's 20rem cannot give 3 cards at 1280px). With 3 characters that gives 1, 2, 2, 2 and 3 cards per row at 375, 768, 1024, 1180 and 1280px. From 1280px `run` is 77rem wide, as wide as the content of the former 80rem body.
- `character-card`: the header has two lines (name + `down`, then class and level in small muted text on their own line below the name); there is no `Help` on the level (it stays on the sheet); cards in one visual row align their first tracker (CSS subgrid, `row-span-2`); `ConditionBadges` only when a condition is set; the four aligned trackers; `DefenseLine` on one line; the two-row `DamageForm` (quick Minor/Major/Severe buttons, then labelled amount `w-[5rem]`, use armor, `btn-primary` Apply). At 1024×768 a card with no condition is at most 500px tall (measured 499.5px at 1024×768; the form keeps its 12px bottom margin, the two rows are 2px apart).

Build step:
- Each `scene` `article` has a header row (`flex flex-wrap items-center gap-2`): title, `scene-status`, Set current, Mark done and `scene-edit-open` (the link sits in the status form's flex row, so the form's 12px bottom margin shifts both together). The link and the buttons share `m-0 border py-1 leading-normal` and are top-aligned within 1px. Then come the notes and `<details data-testid="scene-more">`: closed by default, open on the current scene, with summary `scene.more` ("Loot, encounter and order" / "Butin, rencontre et ordre").
- `scene-more` holds `scene-environment`, the loot section, the encounter section, then a row: ghost Move up, ghost Move down and, at least 1rem after them, `btn-danger` Delete scene.
- One `<Modal kind="scene-edit" opener={false} clear={['scene']}>` per page (title `scene.editTitle`) is opened by `scene-edit-open` (`?step=build&new=scene-edit&scene=<id>`) and posts to `?/edit&step=build`. Its test id is `modal-scene-edit`.
- Every `<summary>` shows an accent `▸`/`▾` marker (`app.css`), so disclosures read as clickable. `h4` (Loot, Encounter) is Cinzel in accent.
- Adversary stats (`adversaryStats`) are one wrapping `text-[0.875rem]` line under the name. The loot give form is one row (select, Give, then Delete in the Build step).
- Loot and encounter forms are one row: number inputs `w-[5rem]` with `min-w-0!`, selects at most 16rem.
- `build-party` takes 1/3 and `build-scenes` 2/3 from 768px.

Character sheet:
- Header: `h1`, `Divider`, a meta line (`flex flex-wrap items-center gap-x-3`: class and level, `Chosen`, `domain`s, `ConditionBadges`), then a button row (`flex flex-wrap gap-2`) of `btn-primary` `level-up` (first, when shown), then `btn-secondary` `campaign-run-link` and `new-edit`; one line at 375px.
- Condition toggles are one row of `aria-pressed` `btn-secondary` buttons.
- `traits`: one row per trait, with the name (help trigger) left and the signed value right-aligned in a fixed `3rem` column.
- `damage-result`: one `<p role="status" aria-live="polite">` (body-size text, at least 16px (us-14), `damageText`), always present and empty until a hit. Run step: between the Fear tracker and the party/aside grid (outside the cards), filled from the `damage` action's `form.damage`. Sheet: Play tab only, in `sheet-trackers` right after `DamageForm`, shows `form?.damage ?? data.damageResult` (the no-JS redirect carries `?tab=play&hit=N[&armor=1]`).
- Run card height budget: 500px at 1024×768 since the quick damage buttons (it was 440px before them).

Other pages:
- Home: the campaign grid stays 1/2/3 columns; `campaign-name` in Cinzel; `campaign-meta` smaller than the name; `new-campaign` `btn-primary`.
- Tunnel and level-up: `tunnel-progress`/`levelup-progress` are a row of numbered steps (current: accent background; done: accent text; next: muted). Next/Create/Confirm are primary, Back secondary, Cancel ghost.
- Reference: entries keep their card look and 2 columns from 768px; the entry name is in Cinzel and its kind in small muted text.
- Modals: `btn-primary` Save and `btn-ghost` `modal-cancel` side by side at the bottom.
- Footer licence: 0.75rem, muted, 2rem above it.

## Shared components
In `src/lib/components/`:
- `Divider`: the h1 flourish (`divider`), left-aligned under the `h1` (`preserveAspectRatio="xMinYMid meet"`; width unchanged, `max-w-xs`).
- `Pips`: filled/empty pips for a tracker (`<name>-pips`).
- `Help`: glossary `id`, `text` prop or `lines: Line[]`, optional `label`; native Popover API: `help-open` (`popovertarget`; the label with a dotted underline, or "?") opens a `popover="auto"` `help-panel` (inline-level `<span>`) styled like the `Modal` panel, closed by Escape, an outside click or `help-close`. The one exception to `Modal` being the only dialog.
- `SrdLines`: props `lines: Line[]` and `lang` (page language); renders SRD lines with inline-level markup only (block `span`s): the label in `lang`, the text in `line.lang`. Used by `Help`'s panel body and by Reference entries.
- `Chosen`: subclass, ancestry and community of a character.
- `Tracker`: one POST form per tracker (`.tracker` marker class), props `name`, `label`, `helpId`, `value`, `filled`, `max`, `action`, `hidden`, `lang`, `variant` (`band` for Fear). A 3-column grid (`6rem` label as `Help label`, nowrap ghost −/value/+, `Pips`); `row`: pips on a second line; see Design system. Used for HP, Stress, Hope and Armor on the sheet and Run cards, and for Fear.
- `DefenseLine`: `Evasion 9 · Thresholds 7/14` on one `ul.stats` line of inline `li`s, each part with its `Help` (`evasion`, `thresholds`). Props `evasion`, `major`, `severe`, `lang`.
- `ConditionBadges`: the condition pills with their `Help` (`condition-vulnerable`, `condition-restrained`, `condition-hidden`). Props `conditions`, `lang`.
- `DamageForm`: one form, two rows; props `action`, `characterId?`, `lang`, `major`, `severe` (the character's thresholds). Row 1 (`flex flex-wrap gap-2`): `damage-minor`, `damage-major`, `damage-severe`, `btn-secondary` submits with `name=quick`, value 1/major/severe, `formnovalidate`, no `type` (so `button[type=submit]` is only Apply). Row 2 (`flex flex-wrap items-end gap-2`): visible "Other amount" label over the amount input (`w-[5rem]`, required), "use armor", `btn-primary` Apply. A non-empty `quick` wins over `amount` (`damageBody`, `src/lib/forms/damage.ts`).
- These four import only `$lib/i18n`, `$app/forms`, `$lib/forms/busy`, `Help` and `Pips`, take `lang` and translate themselves; they never import routes.
- `LanguageSwitcher`: `language-switcher`, `lang-en`, `lang-fr`: two 44px buttons (`EN`, `FR`), the current one `aria-pressed` and primary, the other ghost.
- `Modal.svelte` (props `kind`, `title`, `lang`, optional `params: Record<string, string>` set on the opener and Cancel hrefs, `opener` (default true), `clear` (query parameters removed on close): the only dialog implementation, except the `Help` popover panel.
  - Props: `kind`, `title`, `lang`, `params`, `opener`, `clear`, children.
  - Renders the opener `new-<kind>` (`href="?new=<kind>"`, other params kept) unless `opener={false}`, and `<dialog data-testid="modal-<kind>" aria-labelledby="modal-<kind>-title">`, open when `?new=<kind>` or `form.modal === kind`.
  - The Cancel link is `data-testid="modal-cancel"`.
  - The Save/Cancel row (the `div` holding `modal-cancel`) is `sticky bottom-0`, so it stays visible while a long form (edit) scrolls.
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
- Reference: static, only the GET filter form; empty sections are not shown when filtering by name; sections and entries are closed `<details>` and work without JavaScript.
- Load errors (unknown id, server) go through `+error.svelte`, which translates by status.

## Battle tracker (Run step)
Each `encounter-adversary` card of the current scene lists one `battle-unit` per copy on two lines (the 18rem sidebar cannot fit one): name with copy number when count > 1 and `unit-hp` `marked/max` (plus `unit-defeated`), with `adversary-pips` (one pip per max HP, filled = marked; a defeated copy shows all pips filled in the muted colour) beside `unit-hp`, then `unit-hp-minus`, `unit-hp-plus` and the damage form (amount `w-[4rem]`). A live copy has a damage form (`unit-damage`, `unit-hit`); a defeated one shows `unit-defeated` and is muted. `unit-hp-plus`/`unit-hp-minus` (44px) always adjust one HP. Forms post to `?/battleDamage` and `?/battleHp`. The Build step has none. After the cards, a `<details data-testid="battle-add-more">` (closed; summary `battle.add`; open after a failed `battleAdd`, which returns `section: 'battleAdd'`) holds a `battle-add` form (`battle-add-adversary` select with a blank option and one `optgroup` per tier whose options are `<option value lang label>` with empty bodies, `battle-add-count` 1–20, `battle-add-submit`) posts to `?/battleAdd` and shows only when the current scene has an encounter.

## Test ids
Stable: keep them when restyling.

Existing:
`build`, `run`, `sheet-sections`, `sheet-trackers`, `sheet-traits`, `sheet-equipment`, `sheet-experiences`, `sheet-inventory`, `sheet-cards`, `sheet-notes`, `sheet-tabs`, `tab-play`, `tab-traits`, `tab-gear`, `tab-cards`, `tab-notes`, `sheet-panel`, `sheet-conditions`, `sheet-gold`, `campaign-link`, `campaign-name`, `campaign-meta`, `campaign-run-link`, `card`, `party`, `character-card`, `character-name`, `condition-hidden`, `condition-restrained`, `condition-vulnerable`, `current-scene`, `divider`, `domain`, `down`, `encounter-adjustments`, `encounter-adversary`, `encounter-budget`, `evasion`, `experience`, `fear`, `gold`, `help`, `help-close`, `help-open`, `help-panel`, `inventory`, `item`, `item-row`, `journal`, `journal-entry`, `lang-en`, `lang-fr`, `language-switcher`, `loot-entry`, `nav-home`, `nav-reference`, `notes`, `notes-status`, `party-member`, `ref-item`, `scene`, `scene-environment`, `scene-notes`, `scene-status`, `secondary-blocked`, `sigil`, `srd-licence`, `thresholds`, `battle-unit`, `unit-hp`, `unit-defeated`, `unit-damage`, `unit-hit`, `unit-hp-plus`, `unit-hp-minus`, `battle-add`, `battle-add-adversary`, `battle-add-count`, `battle-add-submit`, `battle-add-more`, `adversary-pips`, `build-party`, `build-scenes`, `damage-minor`, `damage-major`, `damage-severe`, `damage-result`, `adversary-count`, `adversary-count-minus`, `adversary-count-plus`, `gold-handfuls-minus`, `gold-handfuls-plus`, `gold-bags-minus`, `gold-bags-plus`, `gold-chests-minus`, `gold-chests-plus`.

Dynamic: `ref-<kind>` (reference sections), `ref-chip-<kind>` (reference type chips), `step-<k>` (`step-build`, `step-run`), `trait-<k>` (one per trait), `trait-marked-<name>` (one per marked trait), `<name>-pips` (e.g. `fear-pips`), tracker values by key (e.g. `hp`, `hope`), subclass/ancestry/community from `Chosen`, and the equipment blocks `primary-weapon`, `secondary-weapon`, `equipped-armor`.

New (*planned*):
- Sheet: `proficiency`, `subclass-stage`.
- Level-up: `level-up`, `levelup-progress`, `levelup-next`, `levelup-back`, `levelup-cancel`, `levelup-summary`, `levelup-confirm`.
- Build step: `scene-more`, `scene-edit-open`.
- Openers: `new-campaign`, `new-scene`, `new-item`, `new-experience`, `new-card`, `new-character`.
- Modals: `modal-campaign`, `modal-scene`, `modal-item`, `modal-experience`, `modal-card`, `modal-edit`, `modal-scene-edit`, `new-edit`, `modal-cancel`.
- Tunnel: `tunnel-progress`, `tunnel-next`, `tunnel-back`, `tunnel-cancel`, `tunnel-summary`, `tunnel-edit-1`, `tunnel-edit-2`, `tunnel-edit-3`, `tunnel-derived`, `derived-evasion`, `derived-thresholds`, `derived-maxHp`, `derived-maxStress`, `derived-armorSlots`, `tunnel-create`.

Build encounter form: party size, tier and the Generate/Regenerate submit share one `flex flex-wrap items-end gap-2` row; the three adjustment checkboxes sit last in a full-width `<details data-testid="encounter-adjustments" class="basis-full">` (summary `encounter.adjustments`, open only when an adjustment is stored), so opening it never moves the inputs. "Delete encounter" (`btn-danger`) is alone in a `flex justify-end` form on the last row of the encounter section. From `md:` the 44px summary is pulled up (`md:-mt-[3.25rem]`, `md:ml-auto`) into the submit row so it stays inside a 768px-high viewport (clicking it must not scroll the page); the details and its labels then need `md:pointer-events-none`/`md:pointer-events-auto`.

Build step `encounter-adversary` card: one nowrap row form (`?/setCount&step=build`: `sceneId`, every adversary's `id`/`count` pair, `target`) holding a `role=group` stepper (`adversary-count-minus` disabled at 1, `adversary-count`, `adversary-count-plus` disabled at 20; `btn-ghost`, 44px, `name=delta` ±1, stepped by `stepCount` in `counts.ts`) then Remove (`btn-danger ml-auto`).
