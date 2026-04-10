import { pgTable, text, integer, index } from "drizzle-orm/pg-core";

export const taxonsTable = pgTable("taxons", {
  cdNom: integer("cd_nom").primaryKey(),
  cdRef: integer("cd_ref").notNull(),
  cdSup: integer("cd_sup"),
  regne: text("regne"),
  phylum: text("phylum"),
  classe: text("classe"),
  ordre: text("ordre"),
  famille: text("famille"),
  group1Inpn: text("group1_inpn"),
  group2Inpn: text("group2_inpn"),
  group3Inpn: text("group3_inpn"),
  rang: text("rang"),
  lbNom: text("lb_nom").notNull(),
  lbAuteur: text("lb_auteur"),
  nomComplet: text("nom_complet"),
  nomValide: text("nom_valide"),
  nomVern: text("nom_vern"),
  nomVernEng: text("nom_vern_eng"),
  habitat: text("habitat"),
  fr: text("fr"),
  url: text("url"),
}, (table) => [
  index("idx_taxons_cd_ref").on(table.cdRef),
  index("idx_taxons_rang").on(table.rang),
  index("idx_taxons_famille").on(table.famille),
  index("idx_taxons_regne").on(table.regne),
  index("idx_taxons_lb_nom").on(table.lbNom),
]);

export type Taxon = typeof taxonsTable.$inferSelect;
