import { pgTable, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Offline species → habitat associations imported from HABREF (PatriNat / MNHN).
 * Keyed by cd_ref (accepted taxon) so synonyms resolve to the same row.
 * Only EUNIS-typed habitats with a French label are stored for now.
 */
export const habrefHabitatsTable = pgTable("habref_habitats", {
  cdRef: integer("cd_ref").primaryKey(),
  habitats: jsonb("habitats").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HabrefHabitatsRow = typeof habrefHabitatsTable.$inferSelect;

export interface HabrefHabitat {
  code: string;
  label: string;
}
