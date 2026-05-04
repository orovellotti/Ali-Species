/**
 * Streaming RDF dump generator for ALi species.
 *
 * Pulls every taxon, statut, trait, materialised Wikidata mapping and materialised
 * GloBI interaction from PostgreSQL via server-side cursors and serialises them to
 * gzipped Turtle in exports/ali-species-<sha>.ttl.gz.
 *
 * Strategy: serialise each quad with N3.Writer.quadToString() and write the resulting
 * UTF-8 string to a gzip stream, batching ~1000 quads per write call and awaiting
 * 'drain' on the gzip stream when the highWaterMark is reached. This avoids the
 * unbounded memory growth of using N3.StreamWriter in pipeline().
 *
 * Run:    pnpm --filter @workspace/scripts run rdf-export
 * Output: exports/ali-species-<sha>.ttl.gz   +   exports/ali-species-<sha>.stats.csv
 */
import { createWriteStream, mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { createGzip } from "node:zlib";
import { execSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import N3 from "n3";
import pg from "pg";
// @ts-expect-error -- pg-cursor ships no types
import Cursor from "pg-cursor";
import { PREFIXES } from "@workspace/rdf-vocab";
import {
  taxonToQuads,
  statutToQuads,
  traitsToQuads,
  traitSourceVocabQuads,
  wikidataToQuads,
  globiToQuads,
  voidMetadataQuads,
} from "./rdf/map.js";

const { Pool } = pg;
const ROW_BATCH = 5000;
const FLUSH_QUADS = 1000;

interface Stats {
  taxonCount: number;
  statusCount: number;
  traitRowCount: number;
  wikidataCount: number;
  globiCount: number;
  triplesEmitted: number;
}

async function* streamCursor<T>(
  pool: pg.Pool,
  sql: string,
): AsyncGenerator<T> {
  const client = await pool.connect();
  const cursor = client.query(new Cursor(sql));
  try {
    while (true) {
      const rows: T[] = await new Promise((resolve, reject) =>
        cursor.read(ROW_BATCH, (err: Error | undefined, rs: T[]) =>
          err ? reject(err) : resolve(rs),
        ),
      );
      if (rows.length === 0) return;
      for (const r of rows) yield r;
    }
  } finally {
    // Always close the cursor before releasing the client back to the pool,
    // otherwise the next checkout inherits an open cursor and breaks.
    try {
      await new Promise<void>((res) => cursor.close(() => res()));
    } catch {
      // ignore — release the client either way
    }
    client.release();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let sha = "dev";
  try {
    sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    // ok
  }
  const stamp = new Date().toISOString();
  // Resolve exports/ relative to the monorepo root (scripts/src/ → ../../exports)
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const exportsDir = resolve(repoRoot, "exports");
  mkdirSync(exportsDir, { recursive: true });
  const outPath = resolve(exportsDir, `ali-species-${sha}.ttl.gz`);
  const statsPath = resolve(exportsDir, `ali-species-${sha}.stats.csv`);

  // Up-front counts → VOID metadata.
  const [{ rows: tCount }, { rows: sCount }, { rows: trCount }, { rows: wdCount }, { rows: gbCount }] =
    await Promise.all([
      pool.query<{ n: string }>("SELECT count(*)::text AS n FROM taxons"),
      pool.query<{ n: string }>("SELECT count(*)::text AS n FROM bdc_statuts"),
      pool.query<{ n: string }>("SELECT count(*)::text AS n FROM species_traits"),
      pool.query<{ n: string }>("SELECT count(*)::text AS n FROM wikidata_cache"),
      pool.query<{ n: string }>("SELECT count(*)::text AS n FROM globi_cache"),
    ]);

  const stats: Stats = {
    taxonCount: parseInt(tCount[0]!.n, 10),
    statusCount: parseInt(sCount[0]!.n, 10),
    traitRowCount: parseInt(trCount[0]!.n, 10),
    wikidataCount: parseInt(wdCount[0]!.n, 10),
    globiCount: parseInt(gbCount[0]!.n, 10),
    triplesEmitted: 0,
  };

  console.log(`[rdf-export] sha=${sha} sources:`, stats);
  console.log(`[rdf-export] writing ${outPath} ...`);

  // Stringifier (non-streaming — synchronous serialise per quad).
  const stringifier = new N3.Writer({ prefixes: PREFIXES as unknown as Record<string, string> });

  // gzip → file. We write strings directly to gzip and respect its 'drain'.
  const gz = createGzip({ level: 6 });
  const fileOut = createWriteStream(outPath);
  gz.pipe(fileOut);
  // Resolve on 'finish', reject on either stream's 'error' so a mid-stream
  // failure surfaces as a real error instead of hanging the await.
  const filePromise = new Promise<void>((res, rej) => {
    fileOut.once("finish", () => res());
    fileOut.once("error", rej);
    gz.once("error", rej);
  });

  let pendingChunk: string[] = [];

  async function flush(): Promise<void> {
    if (pendingChunk.length === 0) return;
    const chunk = pendingChunk.join("");
    pendingChunk = [];
    if (!gz.write(chunk)) {
      await once(gz, "drain");
    }
  }

  async function writeQuad(q: N3.Quad): Promise<void> {
    pendingChunk.push(stringifier.quadToString(q.subject, q.predicate, q.object));
    if (pendingChunk.length >= FLUSH_QUADS) await flush();
  }

  // Emit @prefix preamble first.
  const preamble =
    Object.entries(PREFIXES)
      .map(([p, iri]) => `@prefix ${p}: <${iri}> .`)
      .join("\n") + "\n\n";
  if (!gz.write(preamble)) await once(gz, "drain");

  // Dataset/vocab metadata.
  const meta = [
    ...voidMetadataQuads({ ...stats, generatedAt: stamp }),
    ...traitSourceVocabQuads(),
  ];
  for (const q of meta) await writeQuad(q);
  stats.triplesEmitted += meta.length;

  // Sources to stream, in order.
  const sources: Array<{
    label: string;
    sql: string;
    map: (row: any) => N3.Quad[];
  }> = [
    {
      label: "taxons",
      sql: `SELECT cd_nom AS "cdNom", cd_ref AS "cdRef", cd_sup AS "cdSup",
              regne, phylum, classe, ordre, famille,
              group1_inpn AS "group1Inpn", group2_inpn AS "group2Inpn", group3_inpn AS "group3Inpn",
              rang, lb_nom AS "lbNom", lb_auteur AS "lbAuteur",
              nom_complet AS "nomComplet", nom_valide AS "nomValide",
              nom_vern AS "nomVern", nom_vern_eng AS "nomVernEng",
              habitat, fr, url
            FROM taxons`,
      map: taxonToQuads,
    },
    {
      label: "bdc_statuts",
      sql: `SELECT id, cd_nom AS "cdNom", cd_ref AS "cdRef",
              cd_type_statut AS "cdTypeStatut", lb_type_statut AS "lbTypeStatut",
              regroupement_type AS "regroupementType",
              code_statut AS "codeStatut", label_statut AS "labelStatut",
              rq_statut AS "rqStatut", cd_sig AS "cdSig", lb_adm_tr AS "lbAdmTr",
              niveau_admin AS "niveauAdmin",
              full_citation AS "fullCitation", doc_url AS "docUrl"
            FROM bdc_statuts`,
      map: statutToQuads,
    },
    {
      label: "species_traits",
      sql: `SELECT cd_nom AS "cdNom", source, traits FROM species_traits`,
      map: traitsToQuads,
    },
    {
      label: "wikidata_cache",
      sql: `SELECT cd_nom AS "cdNom", payload FROM wikidata_cache`,
      map: (r: { cdNom: number; payload: any }) => wikidataToQuads(r.cdNom, r.payload),
    },
    {
      label: "globi_cache",
      sql: `SELECT cd_nom AS "cdNom", payload FROM globi_cache`,
      map: (r: { cdNom: number; payload: any }) => globiToQuads(r.cdNom, r.payload),
    },
  ];

  for (const src of sources) {
    let n = 0;
    let triples = 0;
    const t0 = Date.now();
    for await (const row of streamCursor<any>(pool, src.sql)) {
      const quads = src.map(row);
      for (const q of quads) await writeQuad(q);
      triples += quads.length;
      if (++n % 25_000 === 0) {
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
        console.log(`  [${src.label}] ${n.toLocaleString()} rows · ${triples.toLocaleString()} triples · ${dt}s · rss ${rss}MB`);
      }
    }
    console.log(`  [${src.label}] DONE · ${n.toLocaleString()} rows · ${triples.toLocaleString()} triples`);
    stats.triplesEmitted += triples;
  }

  try {
    await flush();
    gz.end();
    await filePromise;
  } catch (err) {
    // Tear down streams and remove the half-written .ttl.gz so a truncated
    // dump cannot be loaded by oxigraph_server downstream.
    try { gz.destroy(); } catch { /* noop */ }
    try { fileOut.destroy(); } catch { /* noop */ }
    if (existsSync(outPath)) {
      try { unlinkSync(outPath); } catch { /* noop */ }
    }
    throw err;
  } finally {
    await pool.end();
  }

  // Stats CSV (only on full success).
  const csv = [
    "metric,value",
    `git_sha,${sha}`,
    `generated_at,${stamp}`,
    `taxon_count,${stats.taxonCount}`,
    `status_count,${stats.statusCount}`,
    `trait_row_count,${stats.traitRowCount}`,
    `wikidata_link_count,${stats.wikidataCount}`,
    `globi_link_count,${stats.globiCount}`,
    `triples_emitted,${stats.triplesEmitted}`,
    `output_file,${outPath}`,
  ].join("\n");
  writeFileSync(statsPath, csv);

  console.log(`\n[rdf-export] DONE`);
  console.log(`  Triples: ${stats.triplesEmitted.toLocaleString()}`);
  console.log(`  Output:  ${outPath}`);
  console.log(`  Stats:   ${statsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
