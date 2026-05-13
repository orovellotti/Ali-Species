/**
 * Build / rebuild `taxon_search_index` from the `taxons` table.
 *
 * Strategy:
 *  - One index row per cd_nom (so synonyms remain searchable but rank lower).
 *  - For the *reference* row (cd_nom = cd_ref) we also fold all synonyms
 *    (other rows sharing the same cd_ref) into the `synonyms` jsonb and
 *    into `normalized_text`, so a search on a synonym still finds the
 *    reference row first.
 *  - rank_boost encodes a typing-bar preference: species > genus > family > ...
 *  - normalized_text = lower(unaccent(scientific || vern || synonyms || rang)).
 *
 * Idempotent: TRUNCATE + bulk INSERT inside a single transaction.
 *
 * Env:
 *   DATABASE_URL  required
 *   BATCH_SIZE    default 5000
 */
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "5000", 10);

const RANK_BOOST: Record<string, number> = {
  ES: 100, SSES: 95, VAR: 90, FO: 90,
  GN: 70, SSGN: 65,
  FM: 50, SSFM: 45,
  OR: 40, SSOR: 35,
  CL: 30, SSCL: 25,
  PH: 20, KD: 10,
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

interface TaxonRow {
  cd_nom: number;
  cd_ref: number;
  rang: string | null;
  regne: string | null;
  lb_nom: string;
  nom_valide: string | null;
  nom_vern: string | null;
  nom_vern_eng: string | null;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log("build-search-index: scanning taxons...");

  // Map cd_ref -> list of synonym names (lb_nom + nom_vern of non-reference rows)
  const synonymsByRef = new Map<number, string[]>();
  let scanned = 0;
  {
    const cursor = await pool.query<TaxonRow>(
      `SELECT cd_nom, cd_ref, rang, regne, lb_nom, nom_valide, nom_vern, nom_vern_eng
         FROM taxons WHERE cd_nom <> cd_ref`,
    );
    for (const r of cursor.rows) {
      const list = synonymsByRef.get(r.cd_ref) ?? [];
      if (r.lb_nom) list.push(r.lb_nom);
      if (r.nom_vern) list.push(r.nom_vern);
      synonymsByRef.set(r.cd_ref, list);
      scanned++;
    }
  }
  console.log(`-> ${scanned} synonym rows folded, ${synonymsByRef.size} reference taxa with synonyms`);

  console.log("loading all taxa for indexing...");
  const all = await pool.query<TaxonRow>(
    `SELECT cd_nom, cd_ref, rang, regne, lb_nom, nom_valide, nom_vern, nom_vern_eng FROM taxons`,
  );
  console.log(`-> ${all.rowCount} taxa to index`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE TABLE taxon_search_index");

    let buffer: unknown[] = [];
    let placeholders: string[] = [];
    let pi = 1;
    let inserted = 0;

    const flush = async (): Promise<void> => {
      if (placeholders.length === 0) return;
      const sql = `
        INSERT INTO taxon_search_index
          (cd_nom, cd_ref, scientific_name, vernacular_fr, vernacular_en,
           synonyms, normalized_text, rank_boost, is_reference, regne, rang)
        VALUES ${placeholders.join(",")}
      `;
      await client.query(sql, buffer);
      inserted += placeholders.length;
      buffer = []; placeholders = []; pi = 1;
      if (inserted % 25000 === 0) console.log(`  inserted ${inserted}`);
    };

    for (const r of all.rows) {
      const isRef = r.cd_nom === r.cd_ref;
      const sci = r.nom_valide || r.lb_nom;
      const synonyms = isRef ? (synonymsByRef.get(r.cd_ref) ?? []) : [];
      const parts = [sci, r.lb_nom, r.nom_vern, r.nom_vern_eng, ...synonyms].filter((x): x is string => !!x);
      const normalized = stripAccents(parts.join(" | "));
      const rankBoost = (RANK_BOOST[r.rang || ""] ?? 0) + (isRef ? 5 : 0);

      placeholders.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++}::jsonb,$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
      buffer.push(
        r.cd_nom, r.cd_ref, sci, r.nom_vern, r.nom_vern_eng,
        JSON.stringify(synonyms), normalized, rankBoost, isRef, r.regne, r.rang,
      );
      if (placeholders.length >= BATCH_SIZE) await flush();
    }
    await flush();

    // Make sure the trigram index actually exists (drizzle declares it but
    // pg_trgm needs the explicit op-class on the column).
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await client.query("DROP INDEX IF EXISTS idx_taxon_search_normalized_trgm");
    await client.query("CREATE INDEX idx_taxon_search_normalized_trgm ON taxon_search_index USING gin (normalized_text gin_trgm_ops)");

    await client.query("COMMIT");
    console.log(`done — ${inserted} rows`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
