/**
 * Idempotently install the PostgreSQL extensions that the app depends on.
 *
 * - `unaccent`  : used by `/api/taxons/search` (legacy ILIKE path) AND by the
 *                 build of the new `taxon_search_index` (lower(unaccent(...))).
 * - `pg_trgm`   : trigram similarity & GIN indexes (search index, fuzzy match).
 *
 * Safe to run multiple times. Requires a role with CREATE on the database
 * (the default Replit role has it).
 */
import { Pool } from "pg";

const REQUIRED = ["unaccent", "pg_trgm"] as const;

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const ext of REQUIRED) {
      const before = await pool.query(
        "SELECT 1 FROM pg_extension WHERE extname = $1",
        [ext],
      );
      if (before.rowCount && before.rowCount > 0) {
        console.log(`  [ok] ${ext} already installed`);
        continue;
      }
      console.log(`  [..] installing ${ext}...`);
      await pool.query(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
      console.log(`  [ok] ${ext} installed`);
    }
    // Smoke-test the function so we fail loudly if something is still wrong
    // (e.g. extension installed in a different schema not on search_path).
    const probe = await pool.query<{ ok: string }>(
      "SELECT lower(unaccent('Mésange')) AS ok",
    );
    if (probe.rows[0]?.ok !== "mesange") {
      throw new Error(`unaccent smoke-test failed: got '${probe.rows[0]?.ok}'`);
    }
    const trgm = await pool.query<{ s: number }>(
      "SELECT similarity('mesange', 'mesanges')::float AS s",
    );
    console.log(`  [ok] smoke-test: unaccent('Mésange') -> 'mesange', similarity=${trgm.rows[0]?.s}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("ensure-extensions failed:", err);
  process.exit(1);
});
