/**
 * Pre-materialize Wikidata mappings into wikidata_cache for every species that has
 * at least one BdC statut OR one trait row. Uses batched SPARQL (50 names per query)
 * with a polite delay. Resumable: skips rows fetched < 30 days ago.
 *
 * Run: pnpm --filter @workspace/scripts run materialize-wikidata
 */
import pg from "pg";

const { Pool } = pg;
const BATCH = 50;
const DELAY_MS = 1500;
const STALE_DAYS = 30;
const SPARQL_URL = "https://query.wikidata.org/sparql";
const UA = "ALI-Species/1.0 (+https://replit.com) materializer";

const PROPS = [
  ["P3151", "iNaturalist"],
  ["P846", "GBIF"],
  ["P830", "EOL"],
  ["P685", "NCBI"],
  ["P815", "ITIS"],
  ["P10585", "COL"],
  ["P850", "WoRMS"],
  ["P5037", "POWO"],
  ["P961", "IPNI"],
  ["P7715", "WFO"],
] as const;

function escSparql(s: string): string {
  return s.replace(/[\\"\t\n\r\f\b]/g, (c) =>
    ({ "\\": "\\\\", '"': '\\"', "\t": "\\t", "\n": "\\n", "\r": "\\r", "\f": "\\f", "\b": "\\b" }[c]!),
  );
}

function buildBatchSparql(names: string[]): string {
  const values = names.map((n) => `"${escSparql(n)}"`).join(" ");
  const optionals = PROPS.map(([pid, alias]) => `OPTIONAL { ?item wdt:${pid} ?${alias.toLowerCase()}_. }`).join("\n  ");
  const samples = PROPS.map(([, alias]) => `(SAMPLE(?${alias.toLowerCase()}_) AS ?${alias.toLowerCase()})`).join(" ");
  return `
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?name ?item ?itemLabel ?itemDescription ?image ${samples}
WHERE {
  VALUES ?name { ${values} }
  ?item wdt:P225 ?name .
  OPTIONAL { ?item wdt:P18 ?image. }
  ${optionals}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
GROUP BY ?name ?item ?itemLabel ?itemDescription ?image`.trim();
}

/**
 * Returns null on transport / HTTP failure (caller should NOT cache as "empty"),
 * an empty Map when the batch genuinely matched nothing.
 */
async function fetchBatch(names: string[]): Promise<Map<string, any> | null> {
  const sparql = buildBatchSparql(names);
  const url = `${SPARQL_URL}?format=json&query=${encodeURIComponent(sparql)}`;
  const r = await fetch(url, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    console.warn(`  Wikidata HTTP ${r.status}`);
    return null;
  }
  const json = (await r.json()) as { results: { bindings: Array<Record<string, { value: string }>> } };
  const result = new Map<string, any>();
  for (const row of json.results.bindings || []) {
    const name = row.name?.value;
    if (!name) continue;
    const itemUri = row.item?.value || "";
    const qid = itemUri.split("/").pop() || null;
    const externalIds: Array<{ propertyId: string; label: string; value: string }> = [];
    for (const [pid, label] of PROPS) {
      const v = row[label.toLowerCase()]?.value;
      if (v) externalIds.push({ propertyId: pid, label, value: v });
    }
    result.set(name, {
      qid,
      itemLabel: row.itemLabel?.value || null,
      itemDescription: row.itemDescription?.value || null,
      imageUrl: row.image?.value || null,
      traits: [], // we keep payload trim — full trait extraction stays in the live route
      externalIds,
      fetchedAt: new Date().toISOString(),
    });
  }
  return result;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("[wikidata] gathering candidate species (with statut OR trait)...");
  const { rows: candidates } = await pool.query<{ cd_nom: number; lb_nom: string }>(
    `WITH cdnoms AS (
       SELECT DISTINCT cd_ref AS cd_nom FROM bdc_statuts
       UNION
       SELECT DISTINCT cd_nom FROM species_traits
     )
     SELECT t.cd_nom, t.lb_nom
     FROM cdnoms c
     JOIN taxons t ON t.cd_nom = c.cd_nom
     WHERE t.lb_nom IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM wikidata_cache w
         WHERE w.cd_nom = t.cd_nom
           AND w.fetched_at > now() - interval '${STALE_DAYS} days'
       )
     ORDER BY t.cd_nom`,
  );
  console.log(`[wikidata] ${candidates.length} species to materialize`);

  let done = 0;
  let withQid = 0;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH);
    const nameToCdNom = new Map<string, number>();
    for (const c of slice) {
      if (!nameToCdNom.has(c.lb_nom)) nameToCdNom.set(c.lb_nom, c.cd_nom);
    }
    let result: Map<string, any> | null = null;
    try {
      result = await fetchBatch([...nameToCdNom.keys()]);
    } catch (err) {
      console.warn(`  batch ${i}: ${(err as Error).message}`);
    }
    if (result === null) {
      // Skip this batch entirely — leave cache untouched so the next run
      // re-attempts these cd_noms instead of waiting STALE_DAYS.
      console.warn(`  batch ${i}: skipped (will retry next run)`);
      await new Promise((res) => setTimeout(res, DELAY_MS));
      continue;
    }

    for (const c of slice) {
      const payload = result.get(c.lb_nom) ?? {
        qid: null,
        itemLabel: null,
        itemDescription: null,
        imageUrl: null,
        traits: [],
        externalIds: [],
        fetchedAt: new Date().toISOString(),
      };
      if (payload.qid) withQid++;
      await pool.query(
        `INSERT INTO wikidata_cache (cd_nom, qid, payload, fetched_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (cd_nom) DO UPDATE
           SET qid = EXCLUDED.qid, payload = EXCLUDED.payload, fetched_at = now()`,
        [c.cd_nom, payload.qid, payload],
      );
      done++;
    }
    if (done % (BATCH * 10) === 0) {
      console.log(`  ${done.toLocaleString()} / ${candidates.length.toLocaleString()} (${withQid} with QID)`);
    }
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }

  await pool.end();
  console.log(`[wikidata] DONE. ${done} processed, ${withQid} with QID.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
