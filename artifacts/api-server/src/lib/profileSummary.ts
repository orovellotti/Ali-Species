import { eq } from "drizzle-orm";
import { db, taxonProfileSummaryTable, type TaxonProfileSummaryRow } from "@workspace/db";
import { logger } from "./logger.js";
import type {
  ProfileTaxonRow, ProfileStatut, MediaResult, WikipediaSummary, GbifData,
  TraitsSummary, SensitivityResult, ShareSummary,
} from "./profileFetchers.js";

export interface ProfileSummaryRead {
  sensitivity: SensitivityResult;
  shareSummary: ShareSummary;
  media: MediaResult;
  wikipedia: WikipediaSummary;
  gbif: GbifData;
  traitsSummary: TraitsSummary;
  builtAt: Date;
}

const SUMMARY_FRESH_HOURS = 7 * 24;

export async function readProfileSummary(cdNom: number): Promise<ProfileSummaryRead | null> {
  let row: TaxonProfileSummaryRow | undefined;
  try {
    const rows = await db.select().from(taxonProfileSummaryTable).where(eq(taxonProfileSummaryTable.cdNom, cdNom)).limit(1);
    row = rows[0];
  } catch (err) {
    logger.warn({ err, cdNom }, "profile summary read failed");
    return null;
  }
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.builtAt).getTime();
  if (ageMs > SUMMARY_FRESH_HOURS * 3600 * 1000) return null;

  const drivers = (row.sensitivityDrivers as SensitivityResult["drivers"] | null) ?? [];
  const sensitivity: SensitivityResult = {
    score: row.sensitivityScore ?? 0,
    label: row.sensitivityLabel ?? "Sensibilité non évaluée",
    ecological: 0,
    regulatory: 0,
    territorial: 0,
    management: 0,
    drivers,
  };
  const media: MediaResult = row.bestImageUrl
    ? { images: [{ url: row.bestImageUrl, title: row.bestImageTitle, author: row.bestImageAuthor }] }
    : { images: [] };
  const wikipedia: WikipediaSummary = {
    extract: row.wikipediaExtract,
    url: row.wikipediaUrl,
    title: row.wikipediaTitle,
  };
  const gbif: GbifData = {
    gbifKey: row.gbifKey,
    occurrenceCount: row.gbifOccurrenceCount,
    iucnCategory: row.gbifIucnCategory,
    iucnCategoryLabel: row.gbifIucnCategory,
    gbifUrl: row.gbifKey ? `https://www.gbif.org/species/${row.gbifKey}` : null,
    distributionCountries: null,
  };
  const staticSources = (row.staticSources as string[] | null) ?? [];
  const traitsSummary: TraitsSummary = {
    hasStaticTraits: row.hasStaticTraits > 0,
    staticSourcesCount: staticSources.length,
    staticSources,
  };
  const shareSummary: ShareSummary = {
    title: row.shareTitle ?? "",
    description: row.shareDescription ?? "",
    imageUrl: row.bestImageUrl,
    canonicalUrl: row.shareCanonicalUrl ?? "",
  };
  return { sensitivity, shareSummary, media, wikipedia, gbif, traitsSummary, builtAt: new Date(row.builtAt) };
}

export interface ProfileSummaryWriteInput {
  taxon: ProfileTaxonRow;
  statuts: ProfileStatut[];
  sensitivity: SensitivityResult;
  media: MediaResult;
  wikipedia: WikipediaSummary;
  gbif: GbifData;
  traitsSummary: TraitsSummary;
  shareSummary: ShareSummary;
  sourceVersion?: string;
}

export async function upsertProfileSummary(input: ProfileSummaryWriteInput): Promise<void> {
  const { taxon, statuts, sensitivity, media, wikipedia, gbif, traitsSummary, shareSummary, sourceVersion } = input;
  const bestImage = media.images[0];
  const statusBadges = Array.from(new Set(statuts.map((s) => s.cdTypeStatut).filter((x): x is string => !!x)));
  await db
    .insert(taxonProfileSummaryTable)
    .values({
      cdNom: taxon.cdNom,
      sensitivityScore: sensitivity.score,
      sensitivityLabel: sensitivity.label,
      sensitivityDrivers: sensitivity.drivers,
      bestImageUrl: bestImage?.url ?? null,
      bestImageTitle: bestImage?.title ?? null,
      bestImageAuthor: bestImage?.author ?? null,
      shareTitle: shareSummary.title,
      shareDescription: shareSummary.description,
      shareCanonicalUrl: shareSummary.canonicalUrl,
      statutsCount: statuts.length,
      statusBadges: statusBadges,
      hasStaticTraits: traitsSummary.hasStaticTraits ? 1 : 0,
      staticSources: traitsSummary.staticSources,
      gbifKey: gbif.gbifKey,
      gbifIucnCategory: gbif.iucnCategory,
      gbifOccurrenceCount: gbif.occurrenceCount,
      wikipediaTitle: wikipedia.title,
      wikipediaUrl: wikipedia.url,
      wikipediaExtract: wikipedia.extract,
      builtAt: new Date(),
      sourceVersion: sourceVersion ?? null,
    })
    .onConflictDoUpdate({
      target: taxonProfileSummaryTable.cdNom,
      set: {
        sensitivityScore: sensitivity.score,
        sensitivityLabel: sensitivity.label,
        sensitivityDrivers: sensitivity.drivers,
        bestImageUrl: bestImage?.url ?? null,
        bestImageTitle: bestImage?.title ?? null,
        bestImageAuthor: bestImage?.author ?? null,
        shareTitle: shareSummary.title,
        shareDescription: shareSummary.description,
        shareCanonicalUrl: shareSummary.canonicalUrl,
        statutsCount: statuts.length,
        statusBadges: statusBadges,
        hasStaticTraits: traitsSummary.hasStaticTraits ? 1 : 0,
        staticSources: traitsSummary.staticSources,
        gbifKey: gbif.gbifKey,
        gbifIucnCategory: gbif.iucnCategory,
        gbifOccurrenceCount: gbif.occurrenceCount,
        wikipediaTitle: wikipedia.title,
        wikipediaUrl: wikipedia.url,
        wikipediaExtract: wikipedia.extract,
        builtAt: new Date(),
        sourceVersion: sourceVersion ?? null,
      },
    });
}
