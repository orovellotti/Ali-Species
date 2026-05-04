/**
 * Pre-materialize GloBI biotic interactions into globi_cache for every species
 * that has at least one BdC statut OR one trait row. Resumable: skips < 30d old.
 *
 * Run: pnpm --filter @workspace/scripts run materialize-globi
 */
import pg from "pg";

const { Pool } = pg;
const GLOBI_BASE = "https://api.globalbioticinteractions.org";
const TIMEOUT_MS = 15_000;
const DELAY_MS = 250;
const STALE_DAYS = 30;
const TYPES = [
  "eats", "preysOn", "eatenBy", "preyedUponBy",
  "hasParasite", "parasiteOf", "hasEctoparasite", "hasEndoparasite",
  "pollinatedBy", "pollinates", "visitedBy", "visits",
];
const UA = "AliSpecies/1.0 (https://ali-species.replit.app) materializer";

interface Aggregate { data?: Array<[string, string, string[]]>; }

/** Returns null on fetch/HTTP failure (caller should not cache as empty). */
async function fetchOne(name: string, type: string): Promise<string[] | null> {
  const url = `${GLOBI_BASE}/taxon/${encodeURIComponent(name)}/${type}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const json = (await r.json()) as Aggregate;
    const out = new Set<string>();
    for (const row of json.data || []) {
      const targets = row[2];
      if (Array.isArray(targets)) for (const t of targets) if (t) out.add(t);
    }
    return [...out];
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("[globi] gathering candidate species...");
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
         SELECT 1 FROM globi_cache g
         WHERE g.cd_nom = t.cd_nom
           AND g.fetched_at > now() - interval '${STALE_DAYS} days'
       )
     ORDER BY t.cd_nom`,
  );
  console.log(`[globi] ${candidates.length} species to materialize`);

  let done = 0;
  let withInteractions = 0;
  let totalInteractions = 0;
  let skippedFailures = 0;
  for (const c of candidates) {
    const allInteractions: Array<{ interactionType: string; targetTaxonName: string }> = [];
    const settled = await Promise.allSettled(TYPES.map((t) => fetchOne(c.lb_nom, t)));
    let anyFailure = false;
    settled.forEach((s, i) => {
      if (s.status !== "fulfilled" || s.value === null) {
        anyFailure = true;
        return;
      }
      for (const name of s.value) {
        allInteractions.push({ interactionType: TYPES[i]!, targetTaxonName: name });
      }
    });

    // If every endpoint failed AND we got nothing, treat as transient and
    // skip the upsert so the next run retries instead of caching "empty".
    if (anyFailure && allInteractions.length === 0) {
      skippedFailures++;
      await new Promise((res) => setTimeout(res, DELAY_MS));
      continue;
    }

    if (allInteractions.length > 0) withInteractions++;
    totalInteractions += allInteractions.length;

    const payload = {
      scientificName: c.lb_nom,
      interactions: allInteractions,
      fetchedAt: new Date().toISOString(),
    };
    await pool.query(
      `INSERT INTO globi_cache (cd_nom, payload, fetched_at)
       VALUES ($1, $2, now())
       ON CONFLICT (cd_nom) DO UPDATE
         SET payload = EXCLUDED.payload, fetched_at = now()`,
      [c.cd_nom, payload],
    );

    done++;
    if (done % 100 === 0) {
      console.log(
        `  ${done.toLocaleString()} / ${candidates.length.toLocaleString()} · ${withInteractions} with interactions · ${totalInteractions} total edges`,
      );
    }
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }

  await pool.end();
  console.log(`[globi] DONE. ${done} processed, ${withInteractions} with interactions, ${totalInteractions} edges, ${skippedFailures} skipped (transient failures, will retry).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
