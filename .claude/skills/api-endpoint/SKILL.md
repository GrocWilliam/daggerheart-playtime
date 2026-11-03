---
name: api-endpoint
description: Add or change a JSON API endpoint in daggerheart-playtime (src/routes/api/**/+server.ts) and the validation and SQL behind it in src/lib/server/. Use for any new route, request field, status code or response shape.
---

# JSON API

## Shape of an endpoint

```ts
import { ApiError, api, idSchema, json, parse, readJson, renameCampaign } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	const id = parse(idSchema, params.id); // route params that reach SQL are parsed too
	const input = parse(thingSchema, await readJson(request)); // schema in src/lib/server/<domain>.ts
	return json(await renameCampaign(id, input)); // thin handler: the query lives in the domain module
});
```

Handlers stay thin: they parse, call a domain function in `src/lib/server/<domain>.ts` (which throws
`ApiError(404, ...)` for a missing row) and return `json(...)`. Campaign routes work this way (`getCampaign`,
`renameCampaign`, `deleteCampaign`, `adjustFear`, plus `campaignCharacters` / `insertCharacter` in `characters.ts`).

- Always wrap in `api(...)`: it turns `ApiError(status, msg)` into `{"error": msg}` with that status.
- `readJson` gives 400 `malformed JSON`. Validation is a Zod 4 schema exported from `src/lib/server/<domain>.ts`
  (type via `z.infer`), run with `parse(schema, body)` from `campaigns.ts`: it throws `ApiError(400, <message of the
  first issue>)`. The response is `{"error": "..."}` only, never an `issues` field. Put the exact message in the
  schema (`strField`, `intField`, `safeIntField` build fields with the project's messages; `{ error: '...' }` on the
  object for non-object bodies). Messages are unit-tested without a database.
- Schemas that depend on a DB row are factories (`patchSchema(current)`). Keep the original check order: where a
  handler returns 404 before validating the body (PATCH character, PUT conditions), keep it.
- Row → JSON goes through one mapper per resource (`characterJson`, `detail`): camelCase fields, never raw rows.
- Status codes: 200 with the resource, 201 on create, 204 with no body on delete, 400 invalid input, 404 unknown id.
- Queries: new and migrated code uses `getDrizzle()` and the query builder (`select`, `insert().returning()`,
  `update().returning()`, `delete()`), `db.transaction` when several statements must be atomic. A parameterized `sql`
  template is the exception, only for what the builder can't express (e.g. the fear clamp). Never concatenate
  strings into SQL. One statement with `RETURNING` beats read-then-write.
- Migrated: `campaigns.ts`, `characters.ts` (characters, trackers, damage, gold, conditions, cards, items) and their
  routes, which only call exported functions. `db.query` is left only for `/health`.
- Drizzle traps: `onConflictDoUpdate` cannot target an expression index (insert with `onConflictDoNothing`, then
  update); a column inside a `sql` subquery renders unqualified, so correlate with `sql.raw('"table"."col"')`.
- Ids are text uuids (`gen_random_uuid()::text`): an unknown or malformed id is a 404, not a 500.
- Must work on both PGlite and Postgres: plain PostgreSQL only.

## Pages use the API

Pages call these endpoints with `fetch`; when you add a field, update the page action that sends it and the form.

## Check

Unit-test each schema and mapper in `src/lib/server/<domain>.test.ts` (valid input, each rejection,
boundaries). Then `make test`, `make build` and the acceptance scripts of the stories that use the route.
