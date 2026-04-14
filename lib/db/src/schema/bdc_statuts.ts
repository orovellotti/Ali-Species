import { pgTable, text, integer, index, serial } from "drizzle-orm/pg-core";

export const bdcStatutsTable = pgTable("bdc_statuts", {
  id: serial("id").primaryKey(),
  cdNom: integer("cd_nom").notNull(),
  cdRef: integer("cd_ref").notNull(),
  cdTypeStatut: text("cd_type_statut").notNull(),
  lbTypeStatut: text("lb_type_statut"),
  regroupementType: text("regroupement_type"),
  codeStatut: text("code_statut"),
  labelStatut: text("label_statut"),
  rqStatut: text("rq_statut"),
  cdSig: text("cd_sig"),
  lbAdmTr: text("lb_adm_tr"),
  niveauAdmin: text("niveau_admin"),
  fullCitation: text("full_citation"),
  docUrl: text("doc_url"),
}, (table) => [
  index("idx_bdc_statuts_cd_nom").on(table.cdNom),
  index("idx_bdc_statuts_cd_ref").on(table.cdRef),
  index("idx_bdc_statuts_type").on(table.cdTypeStatut),
]);

export type BdcStatut = typeof bdcStatutsTable.$inferSelect;
