// Sets hp_marked directly in a (stopped) PGlite data dir: no HTTP endpoint marks HP yet.
import { PGlite } from '@electric-sql/pglite';
const [dir, id, n] = process.argv.slice(2);
const db = new PGlite(dir);
await db.query('UPDATE characters SET hp_marked = $1 WHERE id = $2', [Number(n), id]);
await db.close();
