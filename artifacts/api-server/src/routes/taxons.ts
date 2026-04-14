import { Router, type IRouter } from "express";
import { sql, eq, and, ilike, or, desc, asc } from "drizzle-orm";
import { db, taxonsTable, bdcStatutsTable } from "@workspace/db";

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
