---
name: ui-style
description: Build or restyle a page, form, component or layout in daggerheart-playtime - Svelte 5 markup, app.css styles, translations, mobile and accessibility rules. Use for any change under src/routes/**/+page.svelte, src/lib/*.svelte or src/app.css, and for any new UI text.
---

# UI and style

## Pages

- A page is `+page.svelte` + `+page.server.ts`. `load` and the form `actions` reach data through the JSON API with the
  page's own `fetch` (the local `call(fetch, method, path, body)` helper), never through `getDb()`.
- An action returns `{ ok: true }` or `failure(r)` (`fail(status, { error })`); the page shows `form.error` in
  `<p role="alert">`. Forms are plain `<form method="POST" action="?/name">`: no client-side JS is needed.
- Svelte 5 runes only: `let { data, form } = $props()`, `$derived`, `$state`. No `export let`, no stores.
- Text: `const t = (key) => translate(data.lang, key)`. Every new key goes in **both** `src/lib/i18n/en.json` and
  `fr.json` (`i18n.test.ts` fails otherwise). Never hard-code UI text.
- Reuse the components in `src/lib/`: `Pips` (tracker dots), `Help` (the "?" glossary helper), `Chosen`, `LanguageSwitcher`.

## Styles

- All styles live in `src/app.css`: no `<style>` blocks, no inline styles, no CSS framework.
- Colours only through the palette variables on `html`: `--bg --surface --text --muted --accent --teal --danger`.
  Write `--teal` as `var(--tea\6c)` (escaped, as the file does): a test scans the CSS for colour names.
- Mobile first: base rules for phones, then `@media (min-width: 600px | 768px | 1024px)`. Never `max-width` queries
  (`app.css.test.ts` checks it). No sideways scroll, 16px text in form controls.
- Every button, link, input and checkbox label is at least 2.75rem (44px) high and wide enough to tap; focus shows
  the teal `:focus-visible` outline.

## Tests read the markup

Acceptance tests select by `data-testid` and some match raw HTML or CSS with regexes (`src/app.css.test.ts`,
`tests/acceptance/*/`). Before renaming, moving or restyling anything:

```sh
grep -rn "data-testid='NAME'\|NAME" tests/acceptance src/app.css.test.ts
```

Keep every existing `data-testid`. If a frozen test matches a word or pattern your change would add elsewhere, find
the workaround already used (e.g. `Help.svelte` escapes "vulnerable"), and note it in CLAUDE.md under Pitfalls.

## Check

`make test`, then `make build` and the acceptance scripts of the pages you touched; look at the page at 375px wide
with Playwright if the story is about layout.
