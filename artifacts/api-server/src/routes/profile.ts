import { Router, type IRouter } from "express";
import {
  fetchTaxonRow,
  fetchClassification,
  fetchChildrenSummary,
  fetchStatuts,
  fetchMedia,
  fetchWikipedia,
  fetchGbif,
  fetchTraitsSummary,
  fetchInteractionsSummary,
  computeProfileSensitivity,
  buildShareSummary,
  type ProfileTaxonRow,
  type ClassificationStep,
  type ChildrenSummary,
  type ProfileStatut,
  type SensitivityResult,
  type MediaResult,
  type WikipediaSummary,
  type GbifData,
  type TraitsSummary,
  type InteractionsSummary,
  type ShareSummary,
} from "../lib/profileFetchers.js";
import { readProfileSummary, upsertProfileSummary } from "../lib/profileSummary.js";

const router: IRouter = Router();

interface BlockError {
  error: true;
  message: string;
}

export interface ProfilePayload {
  taxon: ProfileTaxonRow;
  classification: ClassificationStep[];
  childrenSummary: ChildrenSummary;
  media: MediaResult | BlockError;
  statuts: ProfileStatut[];
  sensitivity: SensitivityResult;
  wikipedia: WikipediaSummary | BlockError;
  gbif: GbifData | BlockError;
  traitsSummary: TraitsSummary;
  interactionsSummary: InteractionsSummary | null | BlockError;
  shareSummary: ShareSummary;
  generatedAt: string;
}

function settledOrError<T>(
  result: PromiseSettledResult<T>,
  fallbackOnError: T | null,
  log: { warn: (obj: unknown, msg?: string) => void },
  blockName: string,
): T | BlockError | null {
  if (result.status === "fulfilled") return result.value;
  log.warn({ blockName, reason: result.reason }, `profile block ${blockName} failed`);
  if (fallbackOnError !== null) return fallbackOnError;
  return { error: true, message: `${blockName} unavailable` };
}

router.get("/taxons/:cdNom/profile", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);
  if (isNaN(cdNom)) {
    res.status(400).json({ error: "Invalid cdNom" });
    return;
  }

  const taxon = await fetchTaxonRow(cdNom);
  if (!taxon) {
    res.status(404).json({ error: "Taxon not found" });
    return;
  }

  // If a fresh precomputed summary exists, use it for external blocks (media,
  // wikipedia, gbif, sensitivity, share, traits) and only run the cheap DB
  // fetchers live (classification + children + statuts).
  const summary = await readProfileSummary(cdNom);
  if (summary) {
    // Cheap DB blocks always run live (classification, children, statuts,
    // interactions). Sensitivity is recomputed from statuts so the full
    // breakdown (ecological/regulatory/territorial/management) stays
    // internally consistent with the global score, regardless of what was
    // persisted in the summary row.
    const [classificationR, childrenSummaryR, statutsR, interactionsSummaryR] =
      await Promise.allSettled([
        fetchClassification(cdNom),
        fetchChildrenSummary(cdNom),
        fetchStatuts(cdNom),
        fetchInteractionsSummary(cdNom),
      ]);
    const statuts = statutsR.status === "fulfilled" ? statutsR.value : [];
    const interactionsSummaryRaw = settledOrError(
      interactionsSummaryR,
      null,
      req.log,
      "interactions",
    );
    const interactionsSummary =
      interactionsSummaryRaw === null
        ? null
        : (interactionsSummaryRaw as InteractionsSummary | BlockError);

    const payload: ProfilePayload = {
      taxon,
      classification: classificationR.status === "fulfilled" ? classificationR.value : [],
      childrenSummary: childrenSummaryR.status === "fulfilled" ? childrenSummaryR.value : { total: 0, preview: [] },
      media: summary.media,
      statuts,
      sensitivity: computeProfileSensitivity(statuts),
      wikipedia: summary.wikipedia,
      gbif: summary.gbif,
      traitsSummary: summary.traitsSummary,
      interactionsSummary,
      shareSummary: summary.shareSummary,
      generatedAt: new Date().toISOString(),
    };
    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=3600");
    res.setHeader("X-Profile-Source", "summary");
    res.json(payload);
    return;
  }

  // Run essential DB fetchers and external fetchers in parallel.
  // External calls degrade gracefully — we still return a 200 with error blocks.
  const [
    classificationR,
    childrenSummaryR,
    statutsR,
    mediaR,
    wikipediaR,
    gbifR,
    traitsSummaryR,
    interactionsSummaryR,
  ] = await Promise.allSettled([
    fetchClassification(cdNom),
    fetchChildrenSummary(cdNom),
    fetchStatuts(cdNom),
    fetchMedia(taxon),
    fetchWikipedia(taxon),
    fetchGbif(taxon),
    fetchTraitsSummary(cdNom),
    fetchInteractionsSummary(cdNom),
  ]);

  const classification =
    classificationR.status === "fulfilled" ? classificationR.value : [];
  const childrenSummary =
    childrenSummaryR.status === "fulfilled"
      ? childrenSummaryR.value
      : { total: 0, preview: [] };
  const statuts = statutsR.status === "fulfilled" ? statutsR.value : [];
  const traitsSummary =
    traitsSummaryR.status === "fulfilled"
      ? traitsSummaryR.value
      : { hasStaticTraits: false, staticSourcesCount: 0, staticSources: [] };

  const media = settledOrError(mediaR, null, req.log, "media") as
    | MediaResult
    | BlockError;
  const wikipedia = settledOrError(wikipediaR, null, req.log, "wikipedia") as
    | WikipediaSummary
    | BlockError;
  const gbif = settledOrError(gbifR, null, req.log, "gbif") as GbifData | BlockError;
  const interactionsSummaryRaw = settledOrError(
    interactionsSummaryR,
    null,
    req.log,
    "interactions",
  );
  const interactionsSummary =
    interactionsSummaryRaw === null
      ? null
      : (interactionsSummaryRaw as InteractionsSummary | BlockError);

  const sensitivity = computeProfileSensitivity(statuts);

  // For shareSummary, fall back to empty media/wiki when the upstreams errored.
  const safeMedia: MediaResult =
    media && !("error" in media) ? media : { images: [] };
  const safeWiki: WikipediaSummary =
    wikipedia && !("error" in wikipedia)
      ? wikipedia
      : { extract: null, url: null, title: null };

  const shareSummary = buildShareSummary({
    taxon,
    sensitivity,
    media: safeMedia,
    wikipedia: safeWiki,
  });

  const payload: ProfilePayload = {
    taxon,
    classification,
    childrenSummary,
    media,
    statuts,
    sensitivity,
    wikipedia,
    gbif,
    traitsSummary,
    interactionsSummary,
    shareSummary,
    generatedAt: new Date().toISOString(),
  };

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  res.setHeader("X-Profile-Source", "live");
  res.json(payload);

  // Best-effort write-through: persist a summary so subsequent requests skip
  // the external upstreams. Only when all external blocks succeeded.
  if (
    !("error" in (media as object)) &&
    !("error" in (wikipedia as object)) &&
    !("error" in (gbif as object))
  ) {
    upsertProfileSummary({
      taxon,
      statuts,
      sensitivity,
      media: media as MediaResult,
      wikipedia: wikipedia as WikipediaSummary,
      gbif: gbif as GbifData,
      traitsSummary,
      shareSummary,
    }).catch((err) => req.log.warn({ err, cdNom }, "profile summary upsert failed"));
  }
});

export default router;
