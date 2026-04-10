import { Router, type IRouter } from "express";
import { sql, eq, ilike, or, desc, asc } from "drizzle-orm";
import { db, taxonsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/taxons/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const regne = typeof req.query.regne === "string" ? req.query.regne : undefined;
  const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit) : 20;
  const limit = Math.min(Math.max(limitRaw || 20, 1), 50);

  if (!q || q.length < 2) {
    res.json([]);
    return;
  }

  const pattern = `%${q}%`;

  let query = db
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
    .where(
      or(
        ilike(taxonsTable.lbNom, pattern),
        ilike(taxonsTable.nomVern, pattern),
      )
    )
    .limit(limit)
    .$dynamic();

  if (regne) {
    query = query.where(
      sql`${taxonsTable.regne} = ${regne} AND (${taxonsTable.lbNom} ILIKE ${pattern} OR ${taxonsTable.nomVern} ILIKE ${pattern})`
    );
  }

  const results = await query;
  res.json(results);
});

router.get("/taxons/stats", async (_req, res): Promise<void> => {
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taxonsTable);

  const [speciesResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taxonsTable)
    .where(eq(taxonsTable.rang, "ES"));

  const [generaResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taxonsTable)
    .where(eq(taxonsTable.rang, "GN"));

  const [familiesResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taxonsTable)
    .where(eq(taxonsTable.rang, "FM"));

  const kingdomCounts = await db
    .select({
      regne: taxonsTable.regne,
      count: sql<number>`count(*)::int`,
    })
    .from(taxonsTable)
    .where(sql`${taxonsTable.regne} IS NOT NULL AND ${taxonsTable.regne} != ''`)
    .groupBy(taxonsTable.regne)
    .orderBy(desc(sql`count(*)`));

  res.json({
    totalTaxons: totalResult?.count ?? 0,
    totalSpecies: speciesResult?.count ?? 0,
    totalGenera: generaResult?.count ?? 0,
    totalFamilies: familiesResult?.count ?? 0,
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
