// Mappe les codes "naturels" (annexes II/IV, A2/A3…) vers les vrais codes
// stockés dans bdc_statuts.code_statut. Indexé par cd_type_statut.
// Les listes rouges (LRN/LRE/LRM/LRR) utilisent déjà les codes IUCN standards
// (CR, EN, VU…) → pas d'aliasing nécessaire pour ces types.
const ALIAS: Record<string, Record<string, string>> = {
  DH: {
    "II": "CDH2", "ANNEXEII": "CDH2", "ANNEXE2": "CDH2", "2": "CDH2",
    "IV": "CDH4", "ANNEXEIV": "CDH4", "ANNEXE4": "CDH4", "4": "CDH4",
    "V":  "CDH5", "ANNEXEV":  "CDH5", "ANNEXE5": "CDH5", "5": "CDH5",
  },
  DO: {
    "I":     "CDO1",  "ANNEXEI":   "CDO1",  "1": "CDO1",
    "II":    "CDO21", "ANNEXEII":  "CDO21",
    "II/1":  "CDO21", "II.1":      "CDO21", "ANNEXEII/1": "CDO21",
    "II/2":  "CDO22", "II.2":      "CDO22", "ANNEXEII/2": "CDO22",
    "III":   "CDO31", "ANNEXEIII": "CDO31",
    "III/1": "CDO31", "III.1":     "CDO31",
    "III/2": "CDO32", "III.2":     "CDO32",
  },
  BERN: {
    "I":   "IBE1", "A1": "IBE1", "ANNEXEI":   "IBE1", "1": "IBE1",
    "II":  "IBE2", "A2": "IBE2", "ANNEXEII":  "IBE2", "2": "IBE2",
    "III": "IBE3", "A3": "IBE3", "ANNEXEIII": "IBE3", "3": "IBE3",
  },
  BONN: {
    "I":  "IBO1", "ANNEXEI":  "IBO1", "1": "IBO1",
    "II": "IBO2", "ANNEXEII": "IBO2", "2": "IBO2",
  },
  BARC: {
    "II":  "AIBA2", "ANNEXEII":  "AIBA2", "2": "AIBA2",
    "III": "AIBA3", "ANNEXEIII": "AIBA3", "3": "AIBA3",
  },
  OSPAR: {
    "V": "IOS5", "ANNEXEV": "IOS5", "5": "IOS5",
  },
};

export function resolveStatutCode(
  statutType: string | undefined,
  code: string | undefined,
): string | undefined {
  if (!code) return code;
  if (!statutType) return code;
  const aliasMap = ALIAS[statutType.toUpperCase()];
  if (!aliasMap) return code;
  const norm = code.trim().toUpperCase().replace(/\s+/g, "");
  return aliasMap[norm] ?? code;
}

// Doc partagée pour les descriptions de tools (ask.ts, mcp.ts).
export const STATUT_CODE_REAL_DOC =
  "Codes RÉELS stockés en base + alias acceptés par type de statut. " +
  "LRN/LRE/LRM/LRR (Listes rouges IUCN) : CR, EN, VU, NT, LC, DD, NA, NE, EX, EW, RE, CR*. " +
  "DH (Directive Habitats) : CDH2 (alias II/2), CDH4 (IV/4), CDH5 (V/5). " +
  "DO (Directive Oiseaux) : CDO1 (I/1), CDO21 (II/1), CDO22 (II/2), CDO31 (III/1), CDO32 (III/2). " +
  "BERN (Convention de Berne) : IBE1 (I/A1/1), IBE2 (II/A2/2), IBE3 (III/A3/3). " +
  "BONN (Convention de Bonn) : IBO1 (I/1), IBO2 (II/2). " +
  "BARC (Barcelone) : AIBA2 (II/2), AIBA3 (III/3). OSPAR : IOS5 (V/5). " +
  "PN/PR/PD/POM/REGL/REGLII (Protections, réglementations) : codes internes alphanumériques (NM2, NO3, RV21, FRnoEEEA…) — préfère omettre statutCode et filtrer seulement par statutType. " +
  "ZDET/PNA/exPNA : pas de code (booléen 'true') → toujours omettre statutCode.";
