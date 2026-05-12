import { pgTable, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const bhlCacheTable = pgTable("bhl_cache", {
  cdNom: integer("cd_nom").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BhlCache = typeof bhlCacheTable.$inferSelect;

export interface BhlReference {
  itemId: number | null;
  titleId: number | null;
  title: string;
  authors: string | null;
  date: string | null;
  url: string;
  bhlType: string | null;
}

export interface BhlPayload {
  scientificName: string;
  references: BhlReference[];
  fetchedAt: string;
  source: "biodiversitylibrary.org";
}
