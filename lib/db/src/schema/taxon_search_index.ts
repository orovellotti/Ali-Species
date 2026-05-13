import { pgTable, integer, text, boolean, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Denormalised search index for `/api/taxons/search`. Built from `taxons`:
 * one row per cd_nom (or per cd_ref — see build script) folding scientific +
 * vernacular FR/EN names + synonyms (other rows with same cd_ref) into one
 * normalised text blob optimised for trigram + prefix lookups.
 *
 * `rank_boost` encodes "this is the kind of result a human typing in the
 * search bar usually wants" (species > genus > family > kingdom). Ties are
 * broken by `is_reference` (cd_nom = cd_ref) so synonyms rank lower.
 *
 * Search order:
 *   1. exact match (lower-unaccent of any name)
 *   2. prefix match
 *   3. trigram similarity
 *
 * Built by `scripts/src/build-search-index.ts` — idempotent.
 */
export const taxonSearchIndexTable = pgTable(
  "taxon_search_index",
  {
    cdNom: integer("cd_nom").primaryKey(),
    cdRef: integer("cd_ref").notNull(),
    scientificName: text("scientific_name").notNull(),
    vernacularFr: text("vernacular_fr"),
    vernacularEn: text("vernacular_en"),
    synonyms: jsonb("synonyms"),
    normalizedText: text("normalized_text").notNull(),
    rankBoost: integer("rank_boost").notNull().default(0),
    isReference: boolean("is_reference").notNull().default(true),
    regne: text("regne"),
    rang: text("rang"),
  },
  (t) => [
    // GIN trigram index created manually by build-search-index.ts (needs gin_trgm_ops)
    index("idx_taxon_search_regne_rank").on(t.regne, t.rankBoost),
    index("idx_taxon_search_cdref").on(t.cdRef),
  ],
);

export type TaxonSearchIndexRow = typeof taxonSearchIndexTable.$inferSelect;
