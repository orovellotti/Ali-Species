/**
 * Build / refresh `taxon_profile_summary` rows by hitting the local
 * `/api/taxons/:cdNom/profile` endpoint, which write-throughs the table on
 * a successful live computation.
 *
 * Strategy: pick taxa worth precomputing first (species rank + has statuts +
 * has vernacular name), skip rows that already have a fresh summary, throttle
 * to avoid hammering Wikipedia / GBIF.
 *
 * Resumable: each iteration is independent, the table acts as the checkpoint.
 *
 * Env:
 *   API_BASE        default http://localhost:80 (the shared proxy)
 *   BATCH_LIMIT     default 0 (unlimited)
 *   CONCURRENCY     default 2
 *   STALE_HOURS     default 168 (1 week) — re-build rows older than this
 *   MIN_RANK        default ES (only species and below by default)
 */
import { Pool } from "pg";

const API_BASE = process.env.API_BASE || "http://localhost:80";
const BATCH_LIMIT = parseInt(process.env.BATCH_LIMIT || "0", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "2", 10);
const STALE_HOURS = parseInt(process.env.STALE_HOURS || "168", 10);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface Candidate { cdNom: number; lbNom: string }

async function pickCandidates(): Promise<Candidate[]> {
  const sql = `
    SELECT t.cd_nom AS "cdNom", t.lb_nom AS "lbNom"
    FROM taxons t
    LEFT JOIN taxon_profile_summary s ON s.cd_nom = t.cd_nom
    WHERE t.rang IN ('ES', 'SSES')
      AND t.cd_nom = t.cd_ref
      AND (
        s.cd_nom IS NULL
        OR s.built_at < NOW() - ($1::int * INTERVAL '1 hour')
      )
    ORDER BY
      CASE WHEN s.cd_nom IS NULL THEN 0 ELSE 1 END,
      (t.nom_vern IS NOT NULL) DESC,
      (SELECT COUNT(*) FROM bdc_statuts b WHERE b.cd_nom = t.cd_nom) DESC,
      t.cd_nom ASC
    ${BATCH_LIMIT > 0 ? "LIMIT $2" : ""}
  `;
  const params: unknown[] = [STALE_HOURS];
  if (BATCH_LIMIT > 0) params.push(BATCH_LIMIT);
  const r = await pool.query(sql, params);
  return r.rows as Candidate[];
}

async function buildOne(c: Candidate): Promise<{ ok: boolean; status?: number; source?: string }> {
  const url = `${API_BASE}/api/taxons/${c.cdNom}/profile`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "build-profile-summaries/1.0" } });
    if (!r.ok) return { ok: false, status: r.status };
    const source = r.headers.get("x-profile-source") ?? undefined;
    // Drain the body so the server flushes write-through.
    await r.json();
    return { ok: true, source };
  } catch (err) {
    console.error(`  fetch ${c.cdNom} failed:`, err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

async function runConcurrent<T, R>(items: T[], n: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await worker(items[idx]);
      }
    }),
  );
  return out;
}

async function main(): Promise<void> {
  console.log(`build-profile-summaries: API_BASE=${API_BASE} concurrency=${CONCURRENCY} stale_hours=${STALE_HOURS} batch=${BATCH_LIMIT || "all"}`);
  const candidates = await pickCandidates();
  console.log(`-> ${candidates.length} candidate taxa`);
  if (candidates.length === 0) { await pool.end(); return; }

  let done = 0;
  let ok = 0;
  let live = 0;
  let summary = 0;
  const start = Date.now();
  await runConcurrent(candidates, CONCURRENCY, async (c) => {
    const r = await buildOne(c);
    done++;
    if (r.ok) {
      ok++;
      if (r.source === "live") live++;
      else if (r.source === "summary") summary++;
    }
    if (done % 25 === 0 || done === candidates.length) {
      const elapsed = (Date.now() - start) / 1000;
      const rate = done / Math.max(1, elapsed);
      console.log(`  ${done}/${candidates.length}  ok=${ok} live=${live} cached=${summary}  ${rate.toFixed(1)}/s`);
    }
  });

  console.log(`done in ${((Date.now() - start) / 1000).toFixed(1)}s — ok=${ok} live=${live} cached=${summary}`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
