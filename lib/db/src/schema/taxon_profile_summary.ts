import { pgTable, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Pre-computed per-taxon summary used to:
 * - serve `/api/taxons/:cdNom/profile` faster (skip live external calls when fresh),
 * - render `/share/taxon/:cdNom` OG meta and `/api/og/taxon/:cdNom.png` without DB joins,
 * - support badge/sensitivity displays on list pages without re-running aggregations.
 *
 * Built by `scripts/src/build-profile-summaries.ts` (idempotent / resumable).
 * `/profile` falls back to live computation when the row is missing or stale.
 */
export const taxonProfileSummaryTable = pgTable(
  "taxon_profile_summary",
  {
    cdNom: integer("cd_nom").primaryKey(),
    sensitivityScore: integer("sensitivity_score"),
    sensitivityLabel: text("sensitivity_label"),
    sensitivityDrivers: jsonb("sensitivity_drivers"),
    bestImageUrl: text("best_image_url"),
    bestImageTitle: text("best_image_title"),
    bestImageAuthor: text("best_image_author"),
    shareTitle: text("share_title"),
    shareDescription: text("share_description"),
    shareCanonicalUrl: text("share_canonical_url"),
    statutsCount: integer("statuts_count").notNull().default(0),
    statusBadges: jsonb("status_badges"),
    hasStaticTraits: integer("has_static_traits").notNull().default(0),
    staticSources: jsonb("static_sources"),
    gbifKey: integer("gbif_key"),
    gbifIucnCategory: text("gbif_iucn_category"),
    gbifOccurrenceCount: integer("gbif_occurrence_count"),
    wikipediaTitle: text("wikipedia_title"),
    wikipediaUrl: text("wikipedia_url"),
    wikipediaExtract: text("wikipedia_extract"),
    builtAt: timestamp("built_at", { withTimezone: true }).notNull().defaultNow(),
    sourceVersion: text("source_version"),
  },
  (t) => [
    index("idx_profile_summary_built_at").on(t.builtAt),
    index("idx_profile_summary_sensitivity").on(t.sensitivityScore),
  ],
);

export type TaxonProfileSummaryRow = typeof taxonProfileSummaryTable.$inferSelect;
export type TaxonProfileSummaryInsert = typeof taxonProfileSummaryTable.$inferInsert;
