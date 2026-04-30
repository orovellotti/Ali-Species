import { pgTable, text, integer, jsonb, primaryKey, index } from "drizzle-orm/pg-core";

export const speciesTraitsTable = pgTable(
  "species_traits",
  {
    cdNom: integer("cd_nom").notNull(),
    source: text("source").notNull(),
    traits: jsonb("traits").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.cdNom, table.source] }),
    index("idx_species_traits_cd_nom").on(table.cdNom),
    index("idx_species_traits_source").on(table.source),
  ],
);

export type SpeciesTraits = typeof speciesTraitsTable.$inferSelect;

export interface TraitField {
  label: string;
  value: string;
  unit?: string;
  raw?: number | string;
}

export type TraitsBlob = Record<string, TraitField>;
