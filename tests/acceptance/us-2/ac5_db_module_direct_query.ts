// Helper invoked by ac5_db_module_direct_query.sh via `tsx`, not a test
// runner file itself. Exercises the db module's function interface directly
// (PGLITE_DATA_DIR=memory:// is set by the caller), with no external process.
import { getDb } from "../../../src/lib/server/db";

async function main() {
  const db = await getDb();
  const { rows } = await db.query("SELECT 1 as one");

  if (!rows || rows.length !== 1 || rows[0].one !== 1) {
    console.error("unexpected rows:", JSON.stringify(rows));
    process.exit(1);
  }

  console.log("AC5_OK");
}

main();
