/**
 * TAXREF v18 rank codes (the values stored in `taxons.rang`).
 *
 * Use these constants instead of bare string literals (`"ES"`, `"FM"`, ...)
 * when filtering or comparing taxon ranks. The codes themselves are stable
 * across TAXREF versions, but referring to them by name makes call sites
 * grep-able and self-documenting.
 *
 * The full list of ranks (variety, hybrid, microspecies, etc.) is translated
 * in `i18n/locales/{fr,en}.ts` under the `ranks.*` keys; we only export here
 * the ones that appear in queries / business logic.
 */
export const TAXREF_RANK = {
  KINGDOM: "KD",
  PHYLUM: "PH",
  CLASS: "CL",
  ORDER: "OR",
  FAMILY: "FM",
  GENUS: "GN",
  SPECIES: "ES",
  SUBSPECIES: "SSES",
} as const;

export type TaxrefRankCode = (typeof TAXREF_RANK)[keyof typeof TAXREF_RANK];
