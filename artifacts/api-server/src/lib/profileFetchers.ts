import { eq, asc, sql } from "drizzle-orm";
import { db, taxonsTable, bdcStatutsTable, speciesTraitsTable } from "@workspace/db";
import { computeSensitivityServer, type ServerSensitivity } from "./sensitivityServer.js";
import { getInteractionsForCdNom } from "../routes/interactions.js";
import { getCachedOrFetch, type FetchOutcome } from "./externalCache.js";

const TTL_WIKIPEDIA = 7 * 24 * 3600;
const TTL_MEDIA = 7 * 24 * 3600;
const TTL_GBIF = 24 * 3600;

export interface ProfileTaxonRow {
  cdNom: number;
  cdRef: number;
  cdSup: number | null;
  regne: string | null;
  phylum: string | null;
  classe: string | null;
  ordre: string | null;
  famille: string | null;
  rang: string | null;
  lbNom: string;
  lbAuteur: string | null;
  nomComplet: string | null;
  nomValide: string | null;
  nomVern: string | null;
  nomVernEng: string | null;
  habitat: string | null;
  fr: string | null;
  url: string | null;
}

export async function fetchTaxonRow(cdNom: number): Promise<ProfileTaxonRow | null> {
  const [taxon] = await db.select().from(taxonsTable).where(eq(taxonsTable.cdNom, cdNom));
  return (taxon as ProfileTaxonRow | undefined) ?? null;
}

export interface ClassificationStep {
  cdNom: number;
  cdRef: number;
  lbNom: string;
  nomVern: string | null;
  rang: string | null;
  famille: string | null;
  regne: string | null;
}

export async function fetchClassification(cdNom: number): Promise<ClassificationStep[]> {
  const path: ClassificationStep[] = [];
  let current: number | null = cdNom;
  const visited = new Set<number>();
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    const [t] = await db
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
      .where(eq(taxonsTable.cdNom, current));
    if (!t) break;
    path.unshift({
      cdNom: t.cdNom,
      cdRef: t.cdRef,
      lbNom: t.lbNom,
      nomVern: t.nomVern,
      rang: t.rang,
      famille: t.famille,
      regne: t.regne,
    });
    current = t.cdSup;
  }
  return path;
}

export interface ChildrenSummary {
  total: number;
  preview: Array<{ cdNom: number; lbNom: string; nomVern: string | null; rang: string | null }>;
}

export async function fetchChildrenSummary(cdNom: number): Promise<ChildrenSummary> {
  // True total via COUNT(*); preview is a small ordered slice.
  const [previewRows, countRows] = await Promise.all([
    db
      .select({
        cdNom: taxonsTable.cdNom,
        lbNom: taxonsTable.lbNom,
        nomVern: taxonsTable.nomVern,
        rang: taxonsTable.rang,
      })
      .from(taxonsTable)
      .where(eq(taxonsTable.cdSup, cdNom))
      .orderBy(asc(taxonsTable.lbNom))
      .limit(12),
    db.execute(sql`SELECT COUNT(*)::int AS n FROM taxons WHERE cd_sup = ${cdNom}`),
  ]);
  const list = (countRows as unknown as { rows?: Array<{ n: number }> }).rows
    ?? (countRows as unknown as Array<{ n: number }>);
  const total = list[0]?.n ?? previewRows.length;
  return { total, preview: previewRows };
}

export interface ProfileStatut {
  cdTypeStatut: string | null;
  lbTypeStatut: string | null;
  regroupementType: string | null;
  codeStatut: string | null;
  labelStatut: string | null;
  rqStatut: string | null;
  cdSig: string | null;
  lbAdmTr: string | null;
  niveauAdmin: string | null;
  fullCitation: string | null;
  docUrl: string | null;
}

export async function fetchStatuts(cdNom: number): Promise<ProfileStatut[]> {
  return db
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
}

export type SensitivityResult = ServerSensitivity;

export function computeProfileSensitivity(statuts: ProfileStatut[]): SensitivityResult {
  return computeSensitivityServer(statuts);
}

export interface MediaImage {
  url: string;
  title: string | null;
  author: string | null;
}

export interface MediaResult {
  images: MediaImage[];
}

function pickShortName(taxon: { lbNom: string; nomValide: string | null }): string {
  return taxon.nomValide?.split(" ").slice(0, 2).join(" ") || taxon.lbNom;
}

const WIKI_UA = "TaxrefExplorer/1.0 (+https://alispecies.io)";

export async function fetchMedia(taxon: ProfileTaxonRow): Promise<MediaResult> {
  const searchName = pickShortName(taxon);
  const result = await getCachedOrFetch<MediaResult>({
    provider: "media_wikipedia_commons",
    cacheKey: searchName.toLowerCase(),
    ttlSeconds: TTL_MEDIA,
    fetcher: async (): Promise<FetchOutcome<MediaResult>> => {
      const wikiResponse = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`,
        { headers: { "User-Agent": WIKI_UA } },
      );
      if (wikiResponse.ok) {
        const wikiData = (await wikiResponse.json()) as {
          thumbnail?: { source?: string };
          originalimage?: { source?: string };
          title?: string;
        };
        const images: MediaImage[] = [];
        if (wikiData.originalimage?.source) {
          images.push({ url: wikiData.originalimage.source, title: wikiData.title || searchName, author: "Wikipedia" });
        } else if (wikiData.thumbnail?.source) {
          images.push({ url: wikiData.thumbnail.source, title: wikiData.title || searchName, author: "Wikipedia" });
        }
        if (images.length > 0) return { kind: "ok", data: { images } };
      }
      const commonsResponse = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(searchName)}&prop=pageimages&format=json&pithumbsize=800&pilicense=any`,
        { headers: { "User-Agent": WIKI_UA } },
      );
      if (commonsResponse.ok) {
        const commonsData = (await commonsResponse.json()) as {
          query?: { pages?: Record<string, { thumbnail?: { source?: string }; title?: string }> };
        };
        const pages = commonsData?.query?.pages || {};
        const images: MediaImage[] = [];
        for (const page of Object.values(pages)) {
          if (page.thumbnail?.source) {
            images.push({ url: page.thumbnail.source, title: page.title || searchName, author: "Wikimedia Commons" });
          }
        }
        if (images.length > 0) return { kind: "ok", data: { images } };
      }
      return { kind: "empty" };
    },
  });
  return result.data ?? { images: [] };
}

export interface WikipediaSummary {
  extract: string | null;
  url: string | null;
  title: string | null;
}

const EMPTY_WIKI: WikipediaSummary = { extract: null, url: null, title: null };

export async function fetchWikipedia(taxon: ProfileTaxonRow): Promise<WikipediaSummary> {
  const searchName = pickShortName(taxon);
  const result = await getCachedOrFetch<WikipediaSummary>({
    provider: "wikipedia_summary",
    cacheKey: searchName.toLowerCase(),
    ttlSeconds: TTL_WIKIPEDIA,
    fetcher: async (): Promise<FetchOutcome<WikipediaSummary>> => {
      for (const lang of ["fr", "en"] as const) {
        const r = await fetch(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`,
          { headers: { "User-Agent": WIKI_UA } },
        );
        if (r.ok) {
          const d = (await r.json()) as {
            extract?: string; content_urls?: { desktop?: { page?: string } };
            title?: string; type?: string;
          };
          if (d.type !== "disambiguation" && d.extract) {
            return { kind: "ok", data: {
              extract: d.extract,
              url: d.content_urls?.desktop?.page || null,
              title: d.title || null,
            } };
          }
        }
      }
      return { kind: "empty" };
    },
  });
  return result.data ?? EMPTY_WIKI;
}

const IUCN_LABELS: Record<string, string> = {
  EX: "Eteint (EX)", EW: "Eteint a l'etat sauvage (EW)",
  CR: "En danger critique (CR)", EN: "En danger (EN)", VU: "Vulnerable (VU)",
  NT: "Quasi menace (NT)", LC: "Preoccupation mineure (LC)",
  DD: "Donnees insuffisantes (DD)", NE: "Non evalue (NE)",
  LEAST_CONCERN: "Preoccupation mineure (LC)", NEAR_THREATENED: "Quasi menace (NT)",
  VULNERABLE: "Vulnerable (VU)", ENDANGERED: "En danger (EN)",
  CRITICALLY_ENDANGERED: "En danger critique (CR)",
  EXTINCT: "Eteint (EX)", EXTINCT_IN_THE_WILD: "Eteint a l'etat sauvage (EW)",
  DATA_DEFICIENT: "Donnees insuffisantes (DD)", NOT_EVALUATED: "Non evalue (NE)",
};

export interface GbifData {
  gbifKey: number | null;
  occurrenceCount: number | null;
  iucnCategory: string | null;
  iucnCategoryLabel: string | null;
  gbifUrl: string | null;
  distributionCountries: null;
}

const EMPTY_GBIF: GbifData = {
  gbifKey: null, occurrenceCount: null, iucnCategory: null,
  iucnCategoryLabel: null, gbifUrl: null, distributionCountries: null,
};

export async function fetchGbif(taxon: ProfileTaxonRow): Promise<GbifData> {
  const searchName = pickShortName(taxon);
  const cacheKey = `${searchName.toLowerCase()}|${(taxon.regne || "").toLowerCase()}`;
  const result = await getCachedOrFetch<GbifData>({
    provider: "gbif_species",
    cacheKey,
    ttlSeconds: TTL_GBIF,
    fetcher: async (): Promise<FetchOutcome<GbifData>> => {
      const matchUrl = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(searchName)}${taxon.regne ? `&kingdom=${encodeURIComponent(taxon.regne)}` : ""}`;
      const matchRes = await fetch(matchUrl);
      if (!matchRes.ok) return { kind: "error", error: `gbif match http ${matchRes.status}` };
      const matchData = (await matchRes.json()) as { usageKey?: number; matchType?: string };
      if (!matchData.usageKey || matchData.matchType === "NONE") return { kind: "empty" };
      const gbifKey = matchData.usageKey;
      const [countRes, iucnRes] = await Promise.all([
        fetch(`https://api.gbif.org/v1/occurrence/count?taxonKey=${gbifKey}`),
        fetch(`https://api.gbif.org/v1/species/${gbifKey}/iucnRedListCategory`),
      ]);
      let occurrenceCount: number | null = null;
      if (countRes.ok) {
        const parsed = parseInt(await countRes.text(), 10);
        occurrenceCount = Number.isNaN(parsed) ? null : parsed;
      }
      let iucnCategory: string | null = null;
      let iucnCategoryLabel: string | null = null;
      if (iucnRes.ok) {
        const iucnData = (await iucnRes.json()) as { category?: string; code?: string };
        const code = iucnData.code || iucnData.category;
        if (code) {
          iucnCategory = code;
          iucnCategoryLabel = IUCN_LABELS[code] || IUCN_LABELS[iucnData.category || ""] || code;
        }
      }
      return { kind: "ok", data: {
        gbifKey, occurrenceCount, iucnCategory, iucnCategoryLabel,
        gbifUrl: `https://www.gbif.org/species/${gbifKey}`,
        distributionCountries: null,
      } };
    },
  });
  return result.data ?? EMPTY_GBIF;
}

export interface TraitsSummary {
  hasStaticTraits: boolean;
  staticSourcesCount: number;
  staticSources: string[];
}

export async function fetchTraitsSummary(cdNom: number): Promise<TraitsSummary> {
  const rows = await db
    .select({ source: speciesTraitsTable.source })
    .from(speciesTraitsTable)
    .where(eq(speciesTraitsTable.cdNom, cdNom));
  const sources = Array.from(new Set(rows.map((r) => r.source)));
  return {
    hasStaticTraits: sources.length > 0,
    staticSourcesCount: sources.length,
    staticSources: sources,
  };
}

export interface InteractionsSummary {
  totalPartners: number;
  groups: Array<{ id: string; label: string; count: number }>;
}

export async function fetchInteractionsSummary(cdNom: number): Promise<InteractionsSummary | null> {
  try {
    const payload = await getInteractionsForCdNom(cdNom);
    if (!payload) return null;
    return {
      totalPartners: payload.totalPartners,
      groups: payload.groups.map((g) => ({ id: g.id, label: g.label, count: g.count })),
    };
  } catch {
    return null;
  }
}

export interface ShareSummary {
  title: string;
  description: string;
  imageUrl: string | null;
  canonicalUrl: string;
}

const SITE_ORIGIN = "https://alispecies.io";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildShareSummary(args: {
  taxon: ProfileTaxonRow;
  sensitivity: SensitivityResult;
  media: MediaResult;
  wikipedia: WikipediaSummary;
}): ShareSummary {
  const { taxon, sensitivity, media, wikipedia } = args;
  const name = taxon.nomVern || taxon.lbNom;
  const sci = taxon.nomValide || taxon.lbNom;
  const title = taxon.nomVern ? `${taxon.nomVern} (${sci})` : sci;
  let description: string;
  if (sensitivity.drivers.length > 0 && sensitivity.score >= 50) {
    description = `${name} — ${sensitivity.label} (${sensitivity.score}/100). Statuts : ${sensitivity.drivers.slice(0, 3).map((d) => d.label).join(", ")}.`;
  } else if (wikipedia.extract) {
    const trimmed = wikipedia.extract.length > 220 ? wikipedia.extract.slice(0, 217) + "..." : wikipedia.extract;
    description = trimmed;
  } else {
    description = `${name} — fiche espèce sur ALI Species (TAXREF v18, statuts BdC, GloBI, traits).`;
  }
  return {
    title,
    description,
    imageUrl: media.images[0]?.url ?? null,
    canonicalUrl: `${SITE_ORIGIN}/taxon/${taxon.cdNom}-${slugify(taxon.lbNom)}`,
  };
}
