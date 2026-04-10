export const TAXONOMIC_RANKS: Record<string, string> = {
  KD: "Kingdom",
  PH: "Phylum",
  CL: "Class",
  OR: "Order",
  FM: "Family",
  GN: "Genus",
  ES: "Species",
  SSES: "Subspecies"
};

export function formatRank(rankCode: string | null | undefined): string {
  if (!rankCode) return "Unknown Rank";
  return TAXONOMIC_RANKS[rankCode] || rankCode;
}
