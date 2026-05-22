import i18n from "@/i18n";

export const TAXONOMIC_RANKS: Record<string, string> = {
  Dumm: "Racine",
  KD: "Regne",
  PH: "Embranchement",
  SBPH: "Sous-embranchement",
  IFPH: "Infra-embranchement",
  CL: "Classe",
  SBCL: "Sous-classe",
  IPCL: "Infra-classe",
  SPCL: "Super-classe",
  OR: "Ordre",
  SBOR: "Sous-ordre",
  IBOR: "Infra-ordre",
  SPOR: "Super-ordre",
  FM: "Famille",
  SBFM: "Sous-famille",
  TR: "Tribu",
  GN: "Genre",
  SSGN: "Sous-genre",
  ES: "Espece",
  SSES: "Sous-espece",
  VAR: "Variete",
  SSRG: "Sous-regne",
  IFRG: "Infra-regne",
  CLAD: "Clade",
  SPTR: "Super-tribu",
  IFCL: "Infra-classe",
  LEGIO: "Legio",
  AGES: "Agregat",
  SCO: "Section",
  CAR: "Cultivar",
  HYB: "Hybride",
  MES: "Micro-espece",
  NAT: "Natio",
  FOES: "Forme",
  AB: "Aberration",
  MO: "Morph",
  RACE: "Race",
};

export function formatRank(rankCode: string | null | undefined): string {
  if (!rankCode) return i18n.t("ranks.unknown");
  const key = `ranks.${rankCode}`;
  const translated = i18n.t(key);
  return translated !== key ? translated : rankCode;
}

export const HABITAT_LABELS: Record<string, string> = {
  "1": "Marin",
  "2": "Eau douce",
  "3": "Terrestre",
  "4": "Marin et eau douce",
  "5": "Marin et terrestre",
  "6": "Eau douce et terrestre",
  "7": "Marin, eau douce et terrestre",
  "8": "Continental (eau douce et terrestre)",
};

export function formatHabitat(code: string | null | undefined): string {
  if (!code) return "";
  const key = `habitats.${code}`;
  const translated = i18n.t(key);
  return translated !== key ? translated : code;
}

export const STATUS_LABELS: Record<string, string> = {
  "P": "Present",
  "E": "Endemique",
  "S": "Subendémique",
  "C": "Cryptogene",
  "I": "Introduit",
  "J": "Introduit envahissant",
  "M": "Introduit non etabli (migrateur/erratique)",
  "B": "Occasionnel",
  "D": "Douteux",
  "A": "Absent",
  "W": "Disparu",
  "X": "Eteint",
  "Y": "Introduit eteint/disparu",
  "Z": "Endémique eteint/disparu",
  "Q": "Mentionne par erreur",
};

export function formatStatus(code: string | null | undefined): string {
  if (!code) return "";
  const key = `statuses.${code}`;
  const translated = i18n.t(key);
  return translated !== key ? translated : code;
}

/**
 * URL-safe slug builder for taxon names.
 *
 * Mirrored server-side in `artifacts/api-server/src/lib/slug.ts` (the
 * workspaces don't share a browser-safe util package). Keep the two in sync
 * — they must produce identical output for the same input, otherwise the
 * canonical URLs built on the client and the sitemap URLs built on the
 * server will drift.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function taxonUrl(cdNom: number, lbNom?: string | null): string {
  if (lbNom) {
    return `/taxon/${cdNom}-${slugify(lbNom)}`;
  }
  return `/taxon/${cdNom}`;
}

export function parseCdNomFromParam(param: string): number {
  const match = param.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
