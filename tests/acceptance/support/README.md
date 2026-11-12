# Acceptance support

Shared domain layer for the acceptance tests (page actions, API setup). Not frozen.

- `api.mjs`: create campaigns, characters, a current scene, journal entries over HTTP.
- `browser.mjs`: `launchBrowser`, `openPage` (5s default timeout), `closePage`.
- `pages.mjs`: page URLs (home, Run step, character sheet tab).
- `looks.mjs`: computed looks on a page (inserted variant probes, keyboard focus outline, `--border` pixel, h1 size, `useArmor` checkbox, buttons with no variant class).
- `css.mjs`: `src/app.css` split into rules with their enclosing `@layer`s, and a scan of `src` for a string.
