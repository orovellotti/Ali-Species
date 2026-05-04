import { pgTable, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const wikidataCacheTable = pgTable(
  "wikidata_cache",
  {
    cdNom: integer("cd_nom").primaryKey(),
    qid: text("qid"),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_wikidata_cache_qid").on(table.qid)],
);

export type WikidataCache = typeof wikidataCacheTable.$inferSelect;

export interface WikidataPayload {
  qid: string | null;
  itemLabel?: string | null;
  itemDescription?: string | null;
  imageUrl?: string | null;
  traits: Array<{ propertyId: string; label: string; value: string; unit?: string | null }>;
  externalIds: Array<{ propertyId: string; label: string; value: string; url?: string | null }>;
  fetchedAt: string;
}
