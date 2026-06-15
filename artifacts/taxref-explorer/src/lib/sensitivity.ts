import type { BdcStatut } from "@workspace/api-client-react";

export const LR_CODE_COLORS: Record<string, string> = {
  EX: "bg-black text-white",
  EW: "bg-black text-white",
  CR: "bg-red-600 text-white",
  EN: "bg-orange-500 text-white",
  VU: "bg-yellow-500 text-white",
  NT: "bg-yellow-300 text-yellow-900",
  LC: "bg-green-500 text-white",
  DD: "bg-gray-400 text-white",
  NA: "bg-gray-300 text-gray-700",
  NE: "bg-gray-200 text-gray-600",
};

const RED_LIST_SCORES: Record<string, number> = {
  EX: 1.0, EW: 1.0, CR: 1.0, EN: 0.8, VU: 0.6, NT: 0.4, LC: 0.2, DD: 0.3, NA: 0.1, NE: 0.0,
};

export interface SensitivityResult {
  score: number;
  ecological: number;
  regulatory: number;
  territorial: number;
  management: number;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
  drivers: { label: string; badgeClass: string; code?: string; title?: string }[];
  explanations: string[];
  inconsistencies: string[];
  missingData: string[];
}

export function computeSensitivity(statuts: BdcStatut[]): SensitivityResult {
  let bestRedList = 0;
  let bestRedListCode = "";
  let protectionScore = 0;
  let directiveScore = 0;
  let conventionScore = 0;
  let znieffScore = 0;
  let pnaScore = 0;
  let invasiveScore = 0;
  let hasRedList = false;
  let hasProtection = false;
  let hasDirective = false;
  let hasConvention = false;
  let hasZnieff = false;
  let hasPna = false;

  const drivers: SensitivityResult["drivers"] = [];
  const explanations: string[] = [];
  const inconsistencies: string[] = [];
  const missingData: string[] = [];

  // Per-statut accumulators so badges reflect each actual entry (type + territory)
  const redListEntries: { type: string; code: string; territory: string; score: number }[] = [];
  const protectionEntries: { type: string; territory: string }[] = [];
  const directiveEntries: { type: string }[] = [];
  const znieffTerritories: string[] = [];
  const pnaEntries: { type: string }[] = [];

  for (const s of statuts) {
    const group = s.regroupementType || "";
    const code = s.codeStatut || "";
    const type = s.cdTypeStatut || "";
    const territory = s.lbAdmTr || "";

    if (group === "Liste rouge") {
      hasRedList = true;
      const score = RED_LIST_SCORES[code] ?? 0;
      if (score > bestRedList) {
        bestRedList = score;
        bestRedListCode = code;
      }
      if (score >= 0.6) {
        const dup = redListEntries.some(e => e.type === type && e.code === code && e.territory === territory);
        if (!dup) redListEntries.push({ type, code, territory, score });
      }
    } else if (group === "Protection") {
      hasProtection = true;
      if (type === "PN") protectionScore = Math.max(protectionScore, 1.0);
      else if (type === "PR") protectionScore = Math.max(protectionScore, 0.8);
      else if (type === "PD") protectionScore = Math.max(protectionScore, 0.7);
      else if (type === "POM") protectionScore = Math.max(protectionScore, 0.9);
      else protectionScore = Math.max(protectionScore, 0.5);
      protectionEntries.push({ type, territory });
    } else if (group === "Directives européennes") {
      hasDirective = true;
      directiveScore = Math.max(directiveScore, 0.8);
      directiveEntries.push({ type });
    } else if (group === "Conventions internationales") {
      hasConvention = true;
      conventionScore = Math.max(conventionScore, 0.7);
    } else if (group === "ZNIEFF") {
      hasZnieff = true;
      znieffScore = 0.6;
      if (territory) znieffTerritories.push(territory);
    } else if (group === "Plan national") {
      hasPna = true;
      if (type === "PNA") pnaScore = Math.max(pnaScore, 0.8);
      else if (type === "exPNA") pnaScore = Math.max(pnaScore, 0.4);
      pnaEntries.push({ type });
    } else if (group === "Réglementation") {
      if (type === "REGLII" || type === "REGLLUTTE") {
        invasiveScore = Math.max(invasiveScore, 0.7);
      }
    }
  }

  const ecological = bestRedList;
  const regulatory = Math.max(protectionScore, directiveScore, conventionScore);
  const territorial = (hasZnieff || hasPna) ? (znieffScore + pnaScore) / ((hasZnieff ? 1 : 0) + (hasPna ? 1 : 0)) : 0;
  const management = invasiveScore;

  const global = 0.4 * ecological + 0.3 * regulatory + 0.2 * territorial + 0.1 * management;
  const score = Math.round(global * 100);

  // Liste rouge — one badge per (type × territoire) above the VU threshold.
  // Order: by severity then national-before-regional.
  const lrTypeShort: Record<string, string> = {
    LRN: "LRN", LRR: "LRR", LRE: "LRE", LRM: "LRM", LRSE: "LRSE",
  };
  const lrTypeLong: Record<string, string> = {
    LRN: "Liste rouge nationale",
    LRR: "Liste rouge régionale",
    LRE: "Liste rouge européenne",
    LRM: "Liste rouge mondiale",
    LRSE: "Liste rouge sous-espèce",
  };
  redListEntries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.type === "LRM" && b.type !== "LRM") return -1;
    if (b.type === "LRM" && a.type !== "LRM") return 1;
    if (a.type === "LRE" && b.type !== "LRE") return -1;
    if (b.type === "LRE" && a.type !== "LRE") return 1;
    if (a.type === "LRN" && b.type !== "LRN") return -1;
    if (b.type === "LRN" && a.type !== "LRN") return 1;
    return 0;
  });
  for (const lr of redListEntries) {
    const typeShort = lrTypeShort[lr.type] || lr.type;
    const typeLong = lrTypeLong[lr.type] || lr.type;
    drivers.push({
      label: `${typeShort} ${lr.code}`,
      badgeClass: LR_CODE_COLORS[lr.code] || "bg-gray-200 text-gray-700",
      code: lr.code,
      title: `${typeLong} (${lr.territory || "—"}) : ${lr.code}`,
    });
  }
  if (bestRedListCode && bestRedList >= 0.6) {
    explanations.push(`Statut Liste rouge ${bestRedListCode} : augmente la sensibilite ecologique`);
  } else if (bestRedListCode && bestRedList >= 0.3) {
    explanations.push(`Statut Liste rouge ${bestRedListCode} : sensibilite ecologique moderee`);
  }

  if (hasProtection) {
    // One badge per protection type seen (deduped)
    const seen = new Set<string>();
    const protTypeLong: Record<string, string> = {
      PN: "Protection nationale",
      PR: "Protection régionale",
      PD: "Protection départementale",
      POM: "Protection outre-mer",
    };
    for (const p of protectionEntries) {
      if (seen.has(p.type)) continue;
      seen.add(p.type);
      drivers.push({
        label: p.type,
        badgeClass: "bg-blue-100 text-blue-800",
        title: `${protTypeLong[p.type] || "Protection"}${p.territory ? ` (${p.territory})` : ""}`,
      });
    }
    const level = protectionScore >= 1.0 ? "nationale" : protectionScore >= 0.8 ? "regionale" : "departementale";
    explanations.push(`Protection ${level} : augmente la sensibilite reglementaire`);
  }

  if (hasDirective) {
    const seen = new Set<string>();
    const dirLabel: Record<string, string> = { DH: "Directive Habitats", DO: "Directive Oiseaux" };
    for (const d of directiveEntries) {
      if (seen.has(d.type)) continue;
      seen.add(d.type);
      drivers.push({
        label: dirLabel[d.type] || `Directive ${d.type}`,
        badgeClass: "bg-indigo-100 text-indigo-800",
        title: dirLabel[d.type] || `Directive européenne ${d.type}`,
      });
    }
    explanations.push("Directive europeenne Habitat/Oiseaux : augmente la sensibilite reglementaire");
  }

  if (hasConvention) {
    drivers.push({
      label: "Convention",
      badgeClass: "bg-violet-100 text-violet-800",
      title: "Convention internationale (Berne, Bonn, Barcelone, OSPAR, CITES…)",
    });
    explanations.push("Convention internationale : renforce le cadre reglementaire");
  }

  if (hasZnieff) {
    const uniq = Array.from(new Set(znieffTerritories));
    drivers.push({
      label: uniq.length === 1 ? `ZNIEFF (${uniq[0]})` : "ZNIEFF",
      badgeClass: "bg-emerald-100 text-emerald-800",
      title: uniq.length > 0 ? `Déterminante ZNIEFF — ${uniq.join(", ")}` : "Déterminante ZNIEFF",
    });
    explanations.push("Determinante ZNIEFF : augmente la sensibilite territoriale");
  }

  if (hasPna) {
    const isActive = pnaEntries.some(p => p.type === "PNA");
    drivers.push({
      label: isActive ? "PNA" : "exPNA",
      badgeClass: "bg-teal-100 text-teal-800",
      title: isActive ? "Plan national d'actions (en cours)" : "Plan national d'actions (terminé)",
    });
    explanations.push("Plan national d'actions : augmente la sensibilite territoriale");
  }

  if (invasiveScore > 0) {
    drivers.push({
      label: "EEE",
      badgeClass: "bg-rose-100 text-rose-800",
      title: "Réglementation d'introduction ou de lutte (espèce exotique envahissante)",
    });
    explanations.push("Reglementation d'introduction/lutte : pression de gestion identifiee");
  }

  if (ecological >= 0.6 && regulatory < 0.3) {
    inconsistencies.push("Risque ecologique eleve avec une protection juridique limitee");
  }
  if (regulatory >= 0.8 && ecological < 0.3) {
    inconsistencies.push("Fort cadre reglementaire malgre un risque ecologique faible");
  }

  if (!hasRedList) missingData.push("Pas de donnees Liste rouge");
  if (!hasProtection && !hasDirective && !hasConvention) missingData.push("Pas de statut de protection connu");

  let label: string, color: string, bgColor: string, borderColor: string, ringColor: string;
  if (score >= 75) {
    label = "Sensibilite critique";
    color = "text-red-700";
    bgColor = "bg-red-50";
    borderColor = "border-red-200";
    ringColor = "stroke-red-500";
  } else if (score >= 50) {
    label = "Sensibilite elevee";
    color = "text-orange-700";
    bgColor = "bg-orange-50";
    borderColor = "border-orange-200";
    ringColor = "stroke-orange-500";
  } else if (score >= 25) {
    label = "Sensibilite moderee";
    color = "text-yellow-700";
    bgColor = "bg-yellow-50";
    borderColor = "border-yellow-200";
    ringColor = "stroke-yellow-500";
  } else {
    label = "Sensibilite faible";
    color = "text-green-700";
    bgColor = "bg-green-50";
    borderColor = "border-green-200";
    ringColor = "stroke-green-500";
  }

  return { score, ecological, regulatory, territorial, management, label, color, bgColor, borderColor, ringColor, drivers, explanations, inconsistencies, missingData };
}
