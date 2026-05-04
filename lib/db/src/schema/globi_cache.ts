import { pgTable, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const globiCacheTable = pgTable("globi_cache", {
  cdNom: integer("cd_nom").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GlobiCache = typeof globiCacheTable.$inferSelect;

export interface GlobiInteraction {
  interactionType: string;
  targetTaxonName: string;
  targetTaxonExternalId?: string | null;
  count?: number;
}

export interface GlobiPayload {
  scientificName: string;
  interactions: GlobiInteraction[];
  fetchedAt: string;
}
