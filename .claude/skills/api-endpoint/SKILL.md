---
name: api-endpoint
description: Add or change a JSON API endpoint in daggerheart-playtime (src/routes/api/**/+server.ts) and the validation and SQL behind it in src/lib/server/. Use for any new route, request field, status code or response shape.
---

# JSON API

## Shape of an endpoint

```ts
import { getDb } from '$lib/server/db';
import { ApiError, api, json, readJson } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const input = parseThing(await readJson(request)); // validation, in src/lib/server/<domain>.ts
	const db = await getDb();
	const { rows } = await db.query('UPDATE ... WHERE id = $2 RETURNING ...', [input.x, params.id]);
	if (!rows[0]) throw new ApiError(404, 'thing not found');
	return json(thingJson(rows[0]));
});
```

- Always wrap in `api(...)`: it turns `ApiError(status, msg)` into `{"error": msg}` with that status.
- `readJson` gives 400 `malformed JSON`. Validation lives in a pure `parseX(body)` in `src/lib/server/<domain>.ts`
  that throws `ApiError(400, ...)` with a precise message: it is unit-tested without a database.
- Row → JSON goes through one mapper per resource (`characterJson`, `detail`): camelCase fields, never raw rows.
- Status codes: 200 with the resource, 201 on create, 204 with no body on delete, 400 invalid input, 404 unknown id.
- SQL: always `$1` parameters, never string concatenation. One statement with `RETURNING` beats read-then-write;
  shared column lists and statements are exported constants (`CHARACTER_COLS`, `GOLD_SQL`, `TRACKER_SQL`).
- Ids are text uuids (`gen_random_uuid()::text`): an unknown or malformed id is a 404, not a 500.
- Must work on both PGlite and Postgres: plain PostgreSQL only.

## Pages use the API

Pages call these endpoints with `fetch`; when you add a field, update the page action that sends it and the form.

## Check

Unit-test the `parseX` and mapper functions in `src/lib/server/<domain>.test.ts` (valid input, each rejection,
boundaries). Then `make test`, `make build` and the acceptance scripts of the stories that use the route.
