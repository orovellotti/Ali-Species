import { Router, type IRouter } from "express";
import { sql, eq, and, ilike, or, desc, asc } from "drizzle-orm";
import { db, taxonsTable, bdcStatutsTable } from "@workspace/db";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const router: IRouter = Router();

const IMAGE_CACHE_DIR = path.join(os.tmpdir(), "ali-img-cache");
const ALLOWED_IMAGE_HOSTS = new Set([
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "fr.wikipedia.org",
  "en.wikipedia.org",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function ensureCacheDir() {
  try { await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true }); } catch {}
}
ensureCacheDir();

router.get("/image-proxy", async (req, res): Promise<void> => {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  if (!url) { res.status(400).end(); return; }

  let parsed: URL;
  try { parsed = new URL(url); } catch { res.status(400).end(); return; }
  if (!/^https?:$/.test(parsed.protocol) || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    res.status(403).end(); return;
  }

  const key = createHash("sha256").update(url).digest("hex");
  const binPath = path.join(IMAGE_CACHE_DIR, `${key}.bin`);
  const metaPath = path.join(IMAGE_CACHE_DIR, `${key}.json`);

  try {
    const [bin, metaRaw] = await Promise.all([fs.readFile(binPath), fs.readFile(metaPath, "utf8")]);
    const meta = JSON.parse(metaRaw) as { contentType: string };
    res.setHeader("Content-Type", meta.contentType || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "HIT");
    res.end(bin);
    return;
  } catch {}

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "AliSpecies/1.0 (https://ali-species.replit.app)" },
    });
    if (!upstream.ok || !upstream.body) { res.status(upstream.status || 502).end(); return; }
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) { res.status(415).end(); return; }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) { res.status(413).end(); return; }

    fs.writeFile(binPath, buf).catch(() => {});
    fs.writeFile(metaPath, JSON.stringify({ contentType })).catch(() => {});

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "MISS");
    res.end(buf);
  } catch {
    res.status(502).end();
  }
});

router.get("/taxons/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const regne = typeof req.query.regne === "string" ? req.query.regne : undefined;
  const territoire = typeof req.query.territoire === "string" ? req.query.territoire.trim() : undefined;
  const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit) : 20;
  const limit = Math.min(Math.max(limitRaw || 20, 1), 50);

  if (!q || q.length < 2) {
    res.json([]);
    return;
  }

  const pattern = `%${q}%`;

  const conds: any[] = [
    or(ilike(taxonsTable.lbNom, pattern), ilike(taxonsTable.nomVern, pattern)),
  ];
  if (regne) conds.push(sql`${taxonsTable.regne} = ${regne}`);
  if (territoire) {
    conds.push(sql`${taxonsTable.cdNom} IN (SELECT DISTINCT cd_nom FROM bdc_statuts WHERE cd_sig = ${territoire})`);
  }

  const results = await db
    .select({
      cdNom: taxonsTable.cdNom,
      cdRef: taxonsTable.cdRef,
      lbNom: taxonsTable.lbNom,
      nomVern: taxonsTable.nomVern,
      rang: taxonsTable.rang,
      famille: taxonsTable.famille,
      regne: taxonsTable.regne,
    })
    .from(taxonsTable)
    .where(and(...conds))
    .limit(limit);

  res.json(results);
});

router.get("/territoires", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT lb_adm_tr AS lb, cd_sig, niveau_admin AS niveau, COUNT(DISTINCT cd_nom)::int AS taxa
    FROM bdc_statuts
    WHERE niveau_admin IN ('Région', 'Département') AND cd_sig IS NOT NULL AND lb_adm_tr IS NOT NULL
    GROUP BY 1, 2, 3
    ORDER BY niveau_admin, lb_adm_tr
  `);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json((rows as any).rows ?? rows);
});

router.get("/taxons/random", async (_req, res): Promise<void> => {
  const [taxon] = await db
    .select({
      cdNom: taxonsTable.cdNom,
      lbNom: taxonsTable.lbNom,
      nomVern: taxonsTable.nomVern,
      rang: taxonsTable.rang,
    })
    .from(taxonsTable)
    .where(and(
      eq(taxonsTable.cdNom, taxonsTable.cdRef),
      eq(taxonsTable.rang, "ES"),
      sql`${taxonsTable.nomVern} IS NOT NULL AND ${taxonsTable.nomVern} != ''`
    ))
    .orderBy(sql`RANDOM()`)
    .limit(1);

  if (!taxon) {
    res.status(404).json({ error: "No species found" });
    return;
  }

  res.json(taxon);
});

router.get("/taxons/taxonomy-children", async (req, res): Promise<void> => {
  const famille = typeof req.query.famille === "string" ? req.query.famille.trim() : "";
  const genre = typeof req.query.genre === "string" ? req.query.genre.trim() : "";
  const statutType = typeof req.query.statutType === "string" ? req.query.statutType.trim() : "";

  if (!famille) {
    res.status(400).json({ error: "famille parameter is required" });
    return;
  }

  const refOnly = sql`cd_nom = cd_ref`;
  const statutFilter = statutType
    ? sql`AND cd_nom IN (SELECT DISTINCT cd_nom FROM bdc_statuts WHERE cd_type_statut = ${statutType})`
    : sql``;

  if (!genre) {
    const rows = await db.execute(sql`
      SELECT
        SPLIT_PART(lb_nom, ' ', 1) AS name,
        COUNT(*)::int AS species_count
      FROM taxons
      WHERE ${refOnly}
        AND famille = ${famille}
        AND rang = 'ES'
        AND lb_nom IS NOT NULL
        AND lb_nom <> ''
        ${statutFilter}
      GROUP BY 1
      HAVING COUNT(*) > 0
      ORDER BY 2 DESC
      LIMIT 200
    `);
    const items = ((rows as any).rows ?? rows).map((r: any) => ({
      name: r.name as string,
      value: Number(r.species_count),
      hasChildren: true,
      rang: "GN",
    }));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(items);
    return;
  }

  const prefix = `${genre} %`;
  const rows = await db.execute(sql`
    SELECT cd_nom, lb_nom, nom_vern
    FROM taxons
    WHERE ${refOnly}
      AND famille = ${famille}
      AND rang = 'ES'
      AND lb_nom LIKE ${prefix}
      ${statutFilter}
    ORDER BY lb_nom
    LIMIT 500
  `);
  const items = ((rows as any).rows ?? rows).map((r: any) => ({
    name: r.lb_nom as string,
    nomVern: r.nom_vern as string | null,
    cdNom: r.cd_nom as number,
    value: 1,
    hasChildren: false,
    rang: "ES",
  }));
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(items);
});

const STATUS_TYPE_ORDER: Record<string, { group: string; rank: number }> = {
  LRM: { group: "International", rank: 1 },
  LRE: { group: "International", rank: 2 },
  DH: { group: "International", rank: 3 },
  DO: { group: "International", rank: 4 },
  BERN: { group: "International", rank: 5 },
  BONN: { group: "International", rank: 6 },
  BARC: { group: "International", rank: 7 },
  OSPAR: { group: "International", rank: 8 },
  LRN: { group: "National", rank: 9 },
  PN: { group: "National", rank: 10 },
  PNA: { group: "National", rank: 11 },
  exPNA: { group: "National", rank: 12 },
  SENSNAT: { group: "National", rank: 13 },
  REGL: { group: "National", rank: 14 },
  REGLII: { group: "National", rank: 15 },
  REGLLUTTE: { group: "National", rank: 16 },
  REGLSO: { group: "National", rank: 17 },
  LRR: { group: "Régional", rank: 18 },
  PR: { group: "Régional", rank: 19 },
  PD: { group: "Régional", rank: 20 },
  POM: { group: "Régional", rank: 21 },
  ZDET: { group: "Régional", rank: 22 },
  SENSREG: { group: "Régional", rank: 23 },
  SENSDEP: { group: "Régional", rank: 24 },
};

router.get("/status-types", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT cd_type_statut AS code, lb_type_statut AS label, COUNT(DISTINCT cd_nom)::int AS taxa
    FROM bdc_statuts
    WHERE cd_type_statut IS NOT NULL AND lb_type_statut IS NOT NULL
    GROUP BY 1, 2
  `);
  const items = ((rows as any).rows ?? rows) as { code: string; label: string; taxa: number }[];
  const decorated = items.map((it) => {
    const meta = STATUS_TYPE_ORDER[it.code] ?? { group: "Autres", rank: 999 };
    return { ...it, group: meta.group, rank: meta.rank };
  });
  decorated.sort((a, b) => (a.rank - b.rank) || a.label.localeCompare(b.label, "fr"));
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json(decorated);
});

router.get("/taxons/taxonomy-tree", async (req, res): Promise<void> => {
  const statutType = typeof req.query.statutType === "string" ? req.query.statutType.trim() : "";
  const refOnly = eq(taxonsTable.cdNom, taxonsTable.cdRef);

  const conds: any[] = [
    refOnly,
    eq(taxonsTable.rang, "ES"),
    sql`${taxonsTable.regne} IS NOT NULL AND ${taxonsTable.regne} != ''`,
  ];
  if (statutType) {
    conds.push(sql`${taxonsTable.cdNom} IN (SELECT DISTINCT cd_nom FROM bdc_statuts WHERE cd_type_statut = ${statutType})`);
  }

  const rows = await db
    .select({
      regne: taxonsTable.regne,
      phylum: taxonsTable.phylum,
      classe: taxonsTable.classe,
      ordre: taxonsTable.ordre,
      famille: taxonsTable.famille,
      count: sql<number>`count(*)::int`,
    })
    .from(taxonsTable)
    .where(and(...conds))
    .groupBy(taxonsTable.regne, taxonsTable.phylum, taxonsTable.classe, taxonsTable.ordre, taxonsTable.famille)
    .orderBy(desc(sql`count(*)`));

  // UICN (Liste rouge nationale) breakdown per (regne/phylum/classe/ordre/famille),
  // filtered by the same statutType so the bars match the visible cells.
  const uicnFilter = statutType
    ? sql`AND t.cd_nom IN (SELECT DISTINCT cd_nom FROM bdc_statuts WHERE cd_type_statut = ${statutType})`
    : sql``;
  const uicnRowsRaw = await db.execute(sql`
    SELECT t.regne, t.phylum, t.classe, t.ordre, t.famille,
           UPPER(s.code_statut) AS code, COUNT(DISTINCT t.cd_nom)::int AS c
    FROM taxons t
    JOIN bdc_statuts s ON s.cd_nom = t.cd_nom AND s.cd_type_statut = 'LRN'
    WHERE t.cd_nom = t.cd_ref AND t.rang = 'ES'
      AND t.regne IS NOT NULL AND t.regne != ''
      AND s.code_statut IS NOT NULL
      ${uicnFilter}
    GROUP BY 1,2,3,4,5,6
  `);
  const uicnRows = ((uicnRowsRaw as { rows?: unknown[] }).rows ?? uicnRowsRaw) as Array<{
    regne: string | null; phylum: string | null; classe: string | null;
    ordre: string | null; famille: string | null; code: string; c: number;
  }>;

  type UicnCounts = Record<string, number>;
  type Tree5 = Record<string, Record<string, Record<string, Record<string, Record<string, { value: number; uicn: UicnCounts }>>>>>;
  const tree: Tree5 = {};
  for (const r of rows) {
    const regno = r.regne || "Inconnu";
    const phylum = r.phylum || "Autre";
    const classe = r.classe || "Autre";
    const ordre = r.ordre || "Autre";
    const famille = r.famille || "Autre";
    tree[regno] ??= {};
    tree[regno][phylum] ??= {};
    tree[regno][phylum][classe] ??= {};
    tree[regno][phylum][classe][ordre] ??= {};
    const cur = tree[regno][phylum][classe][ordre][famille];
    if (cur) cur.value += r.count;
    else tree[regno][phylum][classe][ordre][famille] = { value: r.count, uicn: {} };
  }
  for (const u of uicnRows) {
    const regno = u.regne || "Inconnu";
    const phylum = u.phylum || "Autre";
    const classe = u.classe || "Autre";
    const ordre = u.ordre || "Autre";
    const famille = u.famille || "Autre";
    const node = tree[regno]?.[phylum]?.[classe]?.[ordre]?.[famille];
    if (!node) continue;
    node.uicn[u.code] = (node.uicn[u.code] || 0) + u.c;
  }

  function sortAndSlice<T extends { children?: any[] }>(arr: T[], limit: number): T[] {
    const sumVal = (node: any): number => {
      if (node.value != null) return node.value;
      return (node.children || []).reduce((s: number, c: any) => s + sumVal(c), 0);
    };
    return arr.sort((a, b) => sumVal(b) - sumVal(a)).slice(0, limit);
  }

  const children = Object.entries(tree).map(([regno, phyla]) => ({
    name: regno,
    children: sortAndSlice(
      Object.entries(phyla).map(([phylum, classes]) => ({
        name: phylum,
        children: sortAndSlice(
          Object.entries(classes).map(([classe, ordres]) => ({
            name: classe,
            children: sortAndSlice(
              Object.entries(ordres).map(([ordre, familles]) => ({
                name: ordre,
                children: sortAndSlice(
                  Object.entries(familles).map(([famille, leaf]) => ({
                    name: famille,
                    value: leaf.value,
                    uicn: leaf.uicn,
                  })),
                  20
                ),
              })),
              15
            ),
          })),
          15
        ),
      })),
      10
    ),
  }));

  res.json({ name: "Vivant", children });
});

// Per-class status code breakdown — powers the Baromètre view.
// Generic over cd_type_statut (UICN, directives, protections, ZNIEFF, etc.).
//
// Query params:
//   statutType:  the cd_type_statut to break down (defaults to 'LRN').
//   restrict:    optional second cd_type_statut used to narrow the species
//                universe (so when the page filter differs from the displayed
//                type, both filters compose).
//
// Response: { statutType, lbType, isUicn, items: [{ regne, classe, total,
//             codes: {code -> count}, threatened?, pctMenace? }] }
const UICN_LIKE_TYPES = new Set(["LRN", "LRR", "LRM", "LRE"]);

router.get("/taxons/status-by-class", async (req, res): Promise<void> => {
  const rawType = typeof req.query.statutType === "string" ? req.query.statutType.trim() : "";
  const statutType = rawType || "LRN";
  const restrict = typeof req.query.restrict === "string" ? req.query.restrict.trim() : "";

  const restrictFilter =
    restrict && restrict !== statutType
      ? sql`AND t.cd_nom IN (SELECT DISTINCT cd_nom FROM bdc_statuts WHERE cd_type_statut = ${restrict})`
      : sql``;

  const rowsRaw = await db.execute(sql`
    SELECT t.regne,
           COALESCE(NULLIF(t.classe, ''), 'Autre') AS classe,
           UPPER(s.code_statut) AS code,
           MAX(s.lb_type_statut)        AS lb_type,
           COUNT(DISTINCT t.cd_nom)::int AS c
    FROM taxons t
    JOIN bdc_statuts s ON s.cd_nom = t.cd_nom AND s.cd_type_statut = ${statutType}
    WHERE t.cd_nom = t.cd_ref
      AND t.rang = 'ES'
      AND t.regne IS NOT NULL AND t.regne != ''
      AND s.code_statut IS NOT NULL
      ${restrictFilter}
    GROUP BY 1, 2, 3
  `);
  const rows = ((rowsRaw as { rows?: unknown[] }).rows ?? rowsRaw) as Array<{
    regne: string | null;
    classe: string;
    code: string;
    lb_type: string | null;
    c: number;
  }>;

  const isUicn = UICN_LIKE_TYPES.has(statutType);
  const lbType = rows.find((r) => r.lb_type)?.lb_type ?? statutType;

  type Bucket = { regne: string; classe: string; total: number; codes: Record<string, number> };
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const regne = r.regne || "Inconnu";
    const key = `${regne}|||${r.classe}`;
    const cur = map.get(key) ?? { regne, classe: r.classe, total: 0, codes: {} };
    cur.codes[r.code] = (cur.codes[r.code] || 0) + r.c;
    cur.total += r.c;
    map.set(key, cur);
  }

  const items = Array.from(map.values())
    .map((b) => {
      if (!isUicn) return { ...b };
      const threatened =
        (b.codes.VU || 0) + (b.codes.EN || 0) + (b.codes.CR || 0) +
        (b.codes["CR*"] || 0) + (b.codes.RE || 0) + (b.codes.EX || 0) + (b.codes.EW || 0);
      const pctMenace = b.total > 0 ? (threatened / b.total) * 100 : 0;
      return { ...b, threatened, pctMenace };
    })
    .filter((b) => b.total >= 5)
    .sort((a, b) =>
      isUicn
        ? (b as any).pctMenace - (a as any).pctMenace || b.total - a.total
        : b.total - a.total
    );

  res.json({ statutType, lbType, isUicn, items });
});

// Backward-compatible alias for the original UICN-only endpoint.
router.get("/taxons/uicn-by-class", (req, res, next) => {
  req.url = req.url.replace("/uicn-by-class", "/status-by-class");
  return next();
});

router.get("/taxons/stats", async (_req, res): Promise<void> => {
  const refOnly = eq(taxonsTable.cdNom, taxonsTable.cdRef);

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taxonsTable)
    .where(refOnly);

  const [speciesResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taxonsTable)
    .where(and(refOnly, eq(taxonsTable.rang, "ES")));

  const [generaResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taxonsTable)
    .where(and(refOnly, eq(taxonsTable.rang, "GN")));

  const [familiesResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taxonsTable)
    .where(and(refOnly, eq(taxonsTable.rang, "FM")));

  const kingdomCounts = await db
    .select({
      regne: taxonsTable.regne,
      count: sql<number>`count(*)::int`,
    })
    .from(taxonsTable)
    .where(and(refOnly, sql`${taxonsTable.regne} IS NOT NULL AND ${taxonsTable.regne} != ''`))
    .groupBy(taxonsTable.regne)
    .orderBy(desc(sql`count(*)`));

  const [statutsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bdcStatutsTable);

  res.json({
    totalTaxons: totalResult?.count ?? 0,
    totalSpecies: speciesResult?.count ?? 0,
    totalGenera: generaResult?.count ?? 0,
    totalFamilies: familiesResult?.count ?? 0,
    totalStatuts: statutsResult?.count ?? 0,
    kingdomCounts: kingdomCounts.map((k) => ({
      regne: k.regne || "Unknown",
      count: k.count,
    })),
  });
});

router.get("/taxons/:cdNom", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);

  if (isNaN(cdNom)) {
    res.status(400).json({ error: "Invalid cdNom" });
    return;
  }

  const [taxon] = await db
    .select()
    .from(taxonsTable)
    .where(eq(taxonsTable.cdNom, cdNom));

  if (!taxon) {
    res.status(404).json({ error: "Taxon not found" });
    return;
  }

  res.json(taxon);
});

router.get("/taxons/:cdNom/children", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);

  if (isNaN(cdNom)) {
    res.status(400).json({ error: "Invalid cdNom" });
    return;
  }

  const children = await db
    .select({
      cdNom: taxonsTable.cdNom,
      cdRef: taxonsTable.cdRef,
      lbNom: taxonsTable.lbNom,
      nomVern: taxonsTable.nomVern,
      rang: taxonsTable.rang,
      famille: taxonsTable.famille,
      regne: taxonsTable.regne,
    })
    .from(taxonsTable)
    .where(eq(taxonsTable.cdSup, cdNom))
    .orderBy(asc(taxonsTable.lbNom))
    .limit(100);

  res.json(children);
});

router.get("/taxons/:cdNom/classification", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);

  if (isNaN(cdNom)) {
    res.status(400).json({ error: "Invalid cdNom" });
    return;
  }

  const path: Array<{
    cdNom: number;
    cdRef: number;
    lbNom: string;
    nomVern: string | null;
    rang: string | null;
    famille: string | null;
    regne: string | null;
  }> = [];

  let currentCdNom: number | null = cdNom;
  const visited = new Set<number>();

  while (currentCdNom !== null && !visited.has(currentCdNom)) {
    visited.add(currentCdNom);

    const [taxon] = await db
      .select({
        cdNom: taxonsTable.cdNom,
        cdRef: taxonsTable.cdRef,
        cdSup: taxonsTable.cdSup,
        lbNom: taxonsTable.lbNom,
        nomVern: taxonsTable.nomVern,
        rang: taxonsTable.rang,
        famille: taxonsTable.famille,
        regne: taxonsTable.regne,
      })
      .from(taxonsTable)
      .where(eq(taxonsTable.cdNom, currentCdNom));

    if (!taxon) break;

    path.unshift({
      cdNom: taxon.cdNom,
      cdRef: taxon.cdRef,
      lbNom: taxon.lbNom,
      nomVern: taxon.nomVern,
      rang: taxon.rang,
      famille: taxon.famille,
      regne: taxon.regne,
    });

    currentCdNom = taxon.cdSup;
  }

  res.json(path);
});

router.get("/taxons/:cdNom/statuts", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);

  if (isNaN(cdNom)) {
    res.status(400).json({ error: "Invalid cdNom" });
    return;
  }

  const statuts = await db
    .select({
      cdTypeStatut: bdcStatutsTable.cdTypeStatut,
      lbTypeStatut: bdcStatutsTable.lbTypeStatut,
      regroupementType: bdcStatutsTable.regroupementType,
      codeStatut: bdcStatutsTable.codeStatut,
      labelStatut: bdcStatutsTable.labelStatut,
      rqStatut: bdcStatutsTable.rqStatut,
      cdSig: bdcStatutsTable.cdSig,
      lbAdmTr: bdcStatutsTable.lbAdmTr,
      niveauAdmin: bdcStatutsTable.niveauAdmin,
      fullCitation: bdcStatutsTable.fullCitation,
      docUrl: bdcStatutsTable.docUrl,
    })
    .from(bdcStatutsTable)
    .where(eq(bdcStatutsTable.cdNom, cdNom))
    .orderBy(asc(bdcStatutsTable.regroupementType), asc(bdcStatutsTable.cdTypeStatut));

  res.json(statuts);
});

router.get("/taxons/:cdNom/wikipedia", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);

  if (isNaN(cdNom)) {
    res.status(400).json({ error: "Invalid cdNom" });
    return;
  }

  const [taxon] = await db
    .select({ lbNom: taxonsTable.lbNom, nomValide: taxonsTable.nomValide })
    .from(taxonsTable)
    .where(eq(taxonsTable.cdNom, cdNom));

  if (!taxon) {
    res.json({ extract: null, url: null, title: null });
    return;
  }

  const searchName = taxon.nomValide?.split(" ").slice(0, 2).join(" ") || taxon.lbNom;

  try {
    const wikiRes = await fetch(
      `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`,
      { headers: { "User-Agent": "TaxrefExplorer/1.0" } }
    );

    if (wikiRes.ok) {
      const data = await wikiRes.json() as {
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
        title?: string;
        type?: string;
      };

      if (data.type !== "disambiguation" && data.extract) {
        res.json({
          extract: data.extract,
          url: data.content_urls?.desktop?.page || null,
          title: data.title || null,
        });
        return;
      }
    }

    const wikiResEn = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`,
      { headers: { "User-Agent": "TaxrefExplorer/1.0" } }
    );

    if (wikiResEn.ok) {
      const data = await wikiResEn.json() as {
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
        title?: string;
        type?: string;
      };

      if (data.type !== "disambiguation" && data.extract) {
        res.json({
          extract: data.extract,
          url: data.content_urls?.desktop?.page || null,
          title: data.title || null,
        });
        return;
      }
    }

    res.json({ extract: null, url: null, title: null });
  } catch {
    res.json({ extract: null, url: null, title: null });
  }
});

const IUCN_LABELS: Record<string, string> = {
  EX: "Eteint (EX)",
  EW: "Eteint a l'etat sauvage (EW)",
  CR: "En danger critique (CR)",
  EN: "En danger (EN)",
  VU: "Vulnerable (VU)",
  NT: "Quasi menace (NT)",
  LC: "Preoccupation mineure (LC)",
  DD: "Donnees insuffisantes (DD)",
  NE: "Non evalue (NE)",
  LEAST_CONCERN: "Preoccupation mineure (LC)",
  NEAR_THREATENED: "Quasi menace (NT)",
  VULNERABLE: "Vulnerable (VU)",
  ENDANGERED: "En danger (EN)",
  CRITICALLY_ENDANGERED: "En danger critique (CR)",
  EXTINCT: "Eteint (EX)",
  EXTINCT_IN_THE_WILD: "Eteint a l'etat sauvage (EW)",
  DATA_DEFICIENT: "Donnees insuffisantes (DD)",
  NOT_EVALUATED: "Non evalue (NE)",
};

router.get("/taxons/:cdNom/gbif", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);

  if (isNaN(cdNom)) {
    res.status(400).json({ error: "Invalid cdNom" });
    return;
  }

  const [taxon] = await db
    .select({ lbNom: taxonsTable.lbNom, nomValide: taxonsTable.nomValide, regne: taxonsTable.regne })
    .from(taxonsTable)
    .where(eq(taxonsTable.cdNom, cdNom));

  if (!taxon) {
    res.json({ gbifKey: null, occurrenceCount: null, iucnCategory: null, iucnCategoryLabel: null, gbifUrl: null, distributionCountries: null });
    return;
  }

  const searchName = taxon.nomValide?.split(" ").slice(0, 2).join(" ") || taxon.lbNom;

  try {
    const matchUrl = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(searchName)}${taxon.regne ? `&kingdom=${encodeURIComponent(taxon.regne)}` : ""}`;
    const matchRes = await fetch(matchUrl);

    if (!matchRes.ok) {
      res.json({ gbifKey: null, occurrenceCount: null, iucnCategory: null, iucnCategoryLabel: null, gbifUrl: null, distributionCountries: null });
      return;
    }

    const matchData = await matchRes.json() as { usageKey?: number; matchType?: string };

    if (!matchData.usageKey || matchData.matchType === "NONE") {
      res.json({ gbifKey: null, occurrenceCount: null, iucnCategory: null, iucnCategoryLabel: null, gbifUrl: null, distributionCountries: null });
      return;
    }

    const gbifKey = matchData.usageKey;

    const [countRes, iucnRes] = await Promise.all([
      fetch(`https://api.gbif.org/v1/occurrence/count?taxonKey=${gbifKey}`),
      fetch(`https://api.gbif.org/v1/species/${gbifKey}/iucnRedListCategory`),
    ]);

    let occurrenceCount: number | null = null;
    if (countRes.ok) {
      const countText = await countRes.text();
      const parsed = parseInt(countText, 10);
      occurrenceCount = Number.isNaN(parsed) ? null : parsed;
    }

    let iucnCategory: string | null = null;
    let iucnCategoryLabel: string | null = null;
    if (iucnRes.ok) {
      const iucnData = await iucnRes.json() as { category?: string; code?: string };
      const code = iucnData.code || iucnData.category;
      if (code) {
        iucnCategory = code;
        iucnCategoryLabel = IUCN_LABELS[code] || IUCN_LABELS[iucnData.category || ""] || code;
      }
    }

    res.json({
      gbifKey,
      occurrenceCount,
      iucnCategory,
      iucnCategoryLabel,
      gbifUrl: `https://www.gbif.org/species/${gbifKey}`,
      distributionCountries: null,
    });
  } catch {
    res.json({ gbifKey: null, occurrenceCount: null, iucnCategory: null, iucnCategoryLabel: null, gbifUrl: null, distributionCountries: null });
  }
});

router.get("/taxons/:cdNom/media", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);

  if (isNaN(cdNom)) {
    res.status(400).json({ error: "Invalid cdNom" });
    return;
  }

  const [taxon] = await db
    .select({ lbNom: taxonsTable.lbNom, nomValide: taxonsTable.nomValide })
    .from(taxonsTable)
    .where(eq(taxonsTable.cdNom, cdNom));

  if (!taxon) {
    res.json({ images: [] });
    return;
  }

  const searchName = taxon.nomValide?.split(" ").slice(0, 2).join(" ") || taxon.lbNom;

  try {
    const wikiResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`,
      { headers: { "User-Agent": "TaxrefExplorer/1.0" } }
    );

    if (wikiResponse.ok) {
      const wikiData = await wikiResponse.json() as {
        thumbnail?: { source?: string };
        originalimage?: { source?: string };
        title?: string;
      };

      const images: Array<{ url: string; title: string | null; author: string | null }> = [];

      if (wikiData.originalimage?.source) {
        images.push({
          url: wikiData.originalimage.source,
          title: wikiData.title || searchName,
          author: "Wikipedia",
        });
      } else if (wikiData.thumbnail?.source) {
        images.push({
          url: wikiData.thumbnail.source,
          title: wikiData.title || searchName,
          author: "Wikipedia",
        });
      }

      if (images.length > 0) {
        res.json({ images });
        return;
      }
    }

    const commonsResponse = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(searchName)}&prop=pageimages&format=json&pithumbsize=800&pilicense=any`,
      { headers: { "User-Agent": "TaxrefExplorer/1.0" } }
    );

    if (commonsResponse.ok) {
      const commonsData = await commonsResponse.json() as {
        query?: {
          pages?: Record<string, {
            thumbnail?: { source?: string };
            title?: string;
          }>;
        };
      };

      const pages = commonsData?.query?.pages || {};
      const images: Array<{ url: string; title: string | null; author: string | null }> = [];

      for (const page of Object.values(pages)) {
        if (page.thumbnail?.source) {
          images.push({
            url: page.thumbnail.source,
            title: page.title || searchName,
            author: "Wikimedia Commons",
          });
        }
      }

      res.json({ images });
      return;
    }

    res.json({ images: [] });
  } catch {
    res.json({ images: [] });
  }
});

export default router;
