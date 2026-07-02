/**
 * Pre-fetch EUNIS (European Nature Information System) habitat associations into
 * external_cache for every candidate vertebrate species, so the dashboard count
 * and the taxon pages are backed by real coverage instead of lazy per-view fetches.
 *
 * Scope: birds (Aves), mammals (Mammalia), amphibians (Amphibia) and reptiles
 * (Squamata + Crocodylia). Marine / exotic fish are excluded — EUNIS covers
 * European habitats and fish are almost never assessed there.
 *
 * Replicates artifacts/api-server profileFetchers.fetchEunis exactly (same URL,
 * same parsing, same cache envelope) so the API reads what this writes.
 * Resumable: skips cache entries that are still fresh (expires_at > now).
 *
 * Run: pnpm --filter @workspace/scripts run prefetch-eunis
 */
import pg from "pg";

const { Pool } = pg;

const EUNIS_BASE = "https://eunis.eea.europa.eu/species/";
const UA = "TaxrefExplorer/1.0 (+https://alispecies.io)";
const TTL_SECONDS = 7 * 24 * 3600;
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 5;
const DELAY_MS = 150;

type Outcome =
  | { kind: "ok"; data: EunisData }
  | { kind: "empty" }
  | { kind: "error" };

interface EunisData {
  displayName: string | null;
  preferredHabitats: string[];
  otherHabitats: string[];
  breedingHabitats: string[];
  winteringHabitats: string[];
  sourceUrl: string | null;
}

/** Extract the <li> items of the <ul> that follows a given table header label. */
function parseEunisHabitatList(html: string, label: string): string[] {
  const anchor = html.indexOf(">" + label + "<");
  if (anchor < 0) return [];
  const segment = html.slice(anchor, anchor + 1500);
  const ul = segment.match(/<ul[^>]*>([\s\S]*?)<\/ul>/);
  if (!ul) return [];
  return [...ul[1].matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Extract the <li> items of the <td> that follows a <th> with the given label. */
function parseEunisTableList(html: string, label: string): string[] {
  const th = html.search(new RegExp(`<th[^>]*>\\s*${label}\\s*</th>`, "i"));
  if (th < 0) return [];
  const segment = html.slice(th, th + 2000);
  const td = segment.match(/<td[^>]*>([\s\S]*?)<\/td>/);
  if (!td) return [];
  return [...td[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function fetchEunisOne(searchName: string): Promise<Outcome> {
  const sourceUrl = `${EUNIS_BASE}${encodeURIComponent(searchName)}`;
  let r: Response;
  try {
    r = await fetch(sourceUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { kind: "error" };
  }
  if (!r.ok) return { kind: "error" };
  const html = await r.text();
  const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/);
  const displayName = h1
    ? h1[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    : null;
  if (!displayName || /no results found/i.test(displayName)) return { kind: "empty" };
  const preferredHabitats = parseEunisHabitatList(html, "Most preferred habitats");
  const otherHabitats = parseEunisHabitatList(html, "May also occur in");
  const breedingHabitats = parseEunisTableList(html, "Breeding habitats");
  const winteringHabitats = parseEunisTableList(html, "Wintering habitats");
  if (
    preferredHabitats.length === 0 &&
    otherHabitats.length === 0 &&
    breedingHabitats.length === 0 &&
    winteringHabitats.length === 0
  )
    return { kind: "empty" };
  return {
    kind: "ok",
    data: {
      displayName,
      preferredHabitats,
      otherHabitats,
      breedingHabitats,
      winteringHabitats,
      sourceUrl,
    },
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("[eunis] gathering candidate species (birds, mammals, amphibians, reptiles)...");
  const { rows: candidates } = await pool.query<{ cache_key: string; search_name: string }>(
    `WITH cand AS (
       SELECT DISTINCT
         lower(coalesce(nullif(array_to_string((string_to_array(nom_valide, ' '))[1:2], ' '), ''), lb_nom)) AS cache_key,
         coalesce(nullif(array_to_string((string_to_array(nom_valide, ' '))[1:2], ' '), ''), lb_nom) AS search_name
       FROM taxons
       WHERE cd_nom = cd_ref
         AND rang = 'ES'
         AND lb_nom IS NOT NULL
         AND (classe IN ('Aves', 'Mammalia', 'Amphibia') OR ordre IN ('Squamata', 'Crocodylia'))
     )
     SELECT c.cache_key, min(c.search_name) AS search_name
     FROM cand c
     WHERE c.cache_key IS NOT NULL AND c.cache_key <> ''
       AND NOT EXISTS (
         SELECT 1 FROM external_cache ec
         WHERE ec.provider = 'eunis_habitats'
           AND ec.cache_key = c.cache_key
           AND ec.expires_at > now()
       )
     GROUP BY c.cache_key
     ORDER BY c.cache_key`,
  );
  console.log(`[eunis] ${candidates.length} names to fetch`);

  let done = 0;
  let withHabitats = 0;
  let emptied = 0;
  let errors = 0;

  async function processOne(c: { cache_key: string; search_name: string }): Promise<void> {
    const outcome = await fetchEunisOne(c.search_name);
    if (outcome.kind === "error") {
      // Transient upstream failure: don't cache, let the next run retry.
      errors++;
    } else {
      const envelope =
        outcome.kind === "ok"
          ? { ok: true, data: outcome.data }
          : { ok: true, data: null };
      const status = outcome.kind === "ok" ? "ok" : "empty";
      if (outcome.kind === "ok") withHabitats++;
      else emptied++;
      const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
      await pool.query(
        `INSERT INTO external_cache (provider, cache_key, payload, status, error_message, fetched_at, expires_at)
         VALUES ('eunis_habitats', $1, $2, $3, NULL, now(), $4)
         ON CONFLICT (provider, cache_key) DO UPDATE
           SET payload = EXCLUDED.payload,
               status = EXCLUDED.status,
               error_message = NULL,
               fetched_at = now(),
               expires_at = EXCLUDED.expires_at`,
        [c.cache_key, JSON.stringify(envelope), status, expiresAt],
      );
    }
    done++;
    if (done % 100 === 0) {
      console.log(
        `  ${done.toLocaleString()} / ${candidates.length.toLocaleString()} · ${withHabitats} with habitats · ${emptied} empty · ${errors} errors`,
      );
    }
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }

  // Simple fixed-size worker pool.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < candidates.length) {
      const c = candidates[cursor++]!;
      await processOne(c);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const { rows: totalRows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM external_cache WHERE provider = 'eunis_habitats' AND status = 'ok'`,
  );

  await pool.end();
  console.log(
    `[eunis] DONE. ${done} processed · ${withHabitats} with habitats · ${emptied} empty · ${errors} errors (not cached, will retry).`,
  );
  console.log(`[eunis] total species names with habitats in cache: ${totalRows[0]?.n ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
