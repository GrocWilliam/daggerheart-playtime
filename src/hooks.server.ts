import { getDb } from '$lib/server/db';

// Kick off the DB connection (and its migrations) as soon as the server
// process starts, so they're underway before the first request arrives.
getDb().catch((err) => {
	console.error('database initialization failed', err);
});
