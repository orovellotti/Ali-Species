import { pgTable, text, jsonb, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

/**
 * Generic cache table for upstream external API responses (Wikipedia, GBIF,
 * Wikimedia Commons, etc.). Specific upstreams that need richer indexing
 * (Wikidata QID lookups, BHL per-cd_nom, GloBI per-cd_nom) keep their own
 * dedicated tables.
 *
 * - `provider` discriminates the upstream ("wikipedia_fr", "wikipedia_en",
 *   "gbif_match", "gbif_iucn", "gbif_count", "commons_pageimage", ...).
 * - `cacheKey` is provider-defined (usually a normalised name + variant).
 * - `payload` stores the JSON envelope returned by `getCachedOrFetch`:
 *   `{ ok: true, data: T }` on success, `{ ok: false, error: string }` on
 *   negative cache (4xx / "no result").
 * - `expiresAt` is consulted by `getCachedOrFetch` to decide if a hit is fresh.
 * - `status` is a coarse signal for ops dashboards: "ok" | "empty" | "error".
 */
export const externalCacheTable = pgTable(
  "external_cache",
  {
    provider: text("provider").notNull(),
    cacheKey: text("cache_key").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("ok"),
    errorMessage: text("error_message"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.cacheKey] }),
    index("idx_external_cache_provider_expires").on(t.provider, t.expiresAt),
  ],
);

export type ExternalCacheRow = typeof externalCacheTable.$inferSelect;

export interface ExternalCacheEnvelope<T> {
  ok: boolean;
  data: T | null;
  error?: string | null;
}
