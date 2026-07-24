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

// Territoire pris en compte pour l'axe écologique (Liste rouge).
// - "national" (défaut, interface) : uniquement la Liste rouge nationale (LRN).
// - { region } (API) : Liste rouge nationale (socle) + Liste rouge régionale
//   (LRR) du territoire demandé.
// La Liste rouge mondiale (LRM) et européenne (LRE) n'entrent jamais dans le
// score de patrimonialité (valeur de conservation en France).
export type SensitivityScope = { kind: "national" } | { kind: "region"; region: string };

const NATIONAL_SCOPE: SensitivityScope = { kind: "national" };

function normalizeRegion(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function redListInScope(type: string, territory: string, scope: SensitivityScope): boolean {
  if (type === "LRN") return true;
  if (type === "LRR") {
    return scope.kind === "region" && normalizeRegion(territory) === normalizeRegion(scope.region);
  }
  return false;
}

export function computeSensitivity(
  statuts: BdcStatut[],
  scope: SensitivityScope = NATIONAL_SCOPE,
): SensitivityResult {
  let bestRedList = 0;
  let bestRedListCode = "";
  let protectionScore = 0;
  let directiveScore = 0;
  let conventionScore = 0;
  let znieffScore = 0;
  let pnaScore = 0;
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
      if (!redListInScope(type, territory, scope)) continue;
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
    }
  }

  const ecological = bestRedList;
  const regulatory = Math.max(protectionScore, directiveScore, conventionScore);
  const territorial = (hasZnieff || hasPna) ? (znieffScore + pnaScore) / ((hasZnieff ? 1 : 0) + (hasPna ? 1 : 0)) : 0;

  // Patrimonialité = valeur de conservation d'un taxon. On n'agrège que les axes
  // qui font la valeur patrimoniale (menace écologique, protection réglementaire,
  // enjeu territorial). Le caractère envahissant (gestion/EEE) n'est PAS
  // patrimonial : il fait l'objet d'un score séparé (computeInvasiveness) et
  // n'entre pas ici. Doit rester synchronisé avec le calcul serveur
  // (sensitivityServer.ts).
  const global = 0.5 * ecological + 0.3 * regulatory + 0.2 * territorial;
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
    explanations.push(`Statut Liste rouge ${bestRedListCode} : forte valeur patrimoniale (menace écologique)`);
  } else if (bestRedListCode && bestRedList >= 0.3) {
    explanations.push(`Statut Liste rouge ${bestRedListCode} : valeur patrimoniale écologique modérée`);
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
    explanations.push(`Protection ${level} : renforce la valeur patrimoniale (réglementaire)`);
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
    explanations.push("Directive européenne Habitat/Oiseaux : renforce la valeur patrimoniale (réglementaire)");
  }

  if (hasConvention) {
    drivers.push({
      label: "Convention",
      badgeClass: "bg-violet-100 text-violet-800",
      title: "Convention internationale (Berne, Bonn, Barcelone, OSPAR, CITES…)",
    });
    explanations.push("Convention internationale : renforce la valeur patrimoniale (réglementaire)");
  }

  if (hasZnieff) {
    const uniq = Array.from(new Set(znieffTerritories));
    drivers.push({
      label: uniq.length === 1 ? `ZNIEFF (${uniq[0]})` : "ZNIEFF",
      badgeClass: "bg-emerald-100 text-emerald-800",
      title: uniq.length > 0 ? `Déterminante ZNIEFF — ${uniq.join(", ")}` : "Déterminante ZNIEFF",
    });
    explanations.push("Déterminante ZNIEFF : renforce la valeur patrimoniale (territoriale)");
  }

  if (hasPna) {
    const isActive = pnaEntries.some(p => p.type === "PNA");
    drivers.push({
      label: isActive ? "PNA" : "exPNA",
      badgeClass: "bg-teal-100 text-teal-800",
      title: isActive ? "Plan national d'actions (en cours)" : "Plan national d'actions (terminé)",
    });
    explanations.push("Plan national d'actions : renforce la valeur patrimoniale (territoriale)");
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
    label = "Patrimonialité majeure";
    color = "text-red-700";
    bgColor = "bg-red-50";
    borderColor = "border-red-200";
    ringColor = "stroke-red-500";
  } else if (score >= 50) {
    label = "Patrimonialité forte";
    color = "text-orange-700";
    bgColor = "bg-orange-50";
    borderColor = "border-orange-200";
    ringColor = "stroke-orange-500";
  } else if (score >= 25) {
    label = "Patrimonialité modérée";
    color = "text-yellow-700";
    bgColor = "bg-yellow-50";
    borderColor = "border-yellow-200";
    ringColor = "stroke-yellow-500";
  } else {
    label = "Patrimonialité faible";
    color = "text-green-700";
    bgColor = "bg-green-50";
    borderColor = "border-green-200";
    ringColor = "stroke-green-500";
  }

  return { score, ecological, regulatory, territorial, label, color, bgColor, borderColor, ringColor, drivers, explanations, inconsistencies, missingData };
}

export interface InvasivenessResult {
  score: number;
  isInvasive: boolean;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
  drivers: { label: string; badgeClass: string; title?: string }[];
}

// Score d'envahissement (0-100), SÉPARÉ de la patrimonialité (les deux ne se
// mélangent pas). Basé sur la réglementation exotique envahissante :
//  - REGLLUTTE (obligation de lutte) = signal le plus fort ; code EEEUE =
//    espèce exotique envahissante de l'Union européenne (règlement 2016/1141).
//  - REGLII (interdiction d'introduction) ; code FRnoEEE* = liste métropolitaine.
//  - Bonus d'étendue : nombre de territoires distincts réglementés.
// Doit rester synchronisé avec le calcul serveur (sensitivityServer.ts).
export function computeInvasiveness(statuts: BdcStatut[]): InvasivenessResult {
  let hasFight = false;
  let hasEuFight = false;
  let hasBan = false;
  let hasMetroBan = false;
  const territories = new Set<string>();

  for (const s of statuts) {
    if ((s.regroupementType || "") !== "Réglementation") continue;
    const type = s.cdTypeStatut || "";
    const code = s.codeStatut || "";
    const territory = s.lbAdmTr || "";
    if (type === "REGLLUTTE") {
      hasFight = true;
      if (code === "EEEUE") hasEuFight = true;
      if (territory) territories.add(territory);
    } else if (type === "REGLII") {
      hasBan = true;
      if (code.startsWith("FRnoEEE")) hasMetroBan = true;
      if (territory) territories.add(territory);
    }
  }

  let base = 0;
  if (hasFight) base = hasEuFight ? 0.9 : 0.8;
  else if (hasBan) base = hasMetroBan ? 0.7 : 0.55;

  const isInvasive = base > 0;
  const spread = territories.size > 1 ? Math.min(0.3, 0.05 * (territories.size - 1)) : 0;
  const score = isInvasive ? Math.round(Math.min(1, base + spread) * 100) : 0;

  const drivers: InvasivenessResult["drivers"] = [];
  if (hasFight) {
    drivers.push({
      label: hasEuFight ? "EEE Union européenne" : "Lutte obligatoire",
      badgeClass: "bg-rose-100 text-rose-800",
      title: hasEuFight
        ? "Espèce exotique envahissante de l'Union européenne (règlement 2016/1141) — obligation de lutte"
        : "Obligation de lutte contre une espèce exotique envahissante",
    });
  }
  if (hasBan) {
    drivers.push({
      label: hasMetroBan ? "Interdite (métropole)" : "Introduction interdite",
      badgeClass: "bg-rose-100 text-rose-800",
      title: hasMetroBan
        ? "Interdiction d'introduction sur le territoire métropolitain (espèce exotique envahissante)"
        : "Interdiction d'introduction (espèce exotique envahissante)",
    });
  }
  if (territories.size > 1) {
    drivers.push({
      label: `${territories.size} territoires`,
      badgeClass: "bg-rose-50 text-rose-700",
      title: `Réglementée dans ${territories.size} territoires`,
    });
  }

  let label: string, color: string, bgColor: string, borderColor: string, ringColor: string;
  if (score >= 75) {
    label = "Envahissement majeur";
    color = "text-rose-800"; bgColor = "bg-rose-50"; borderColor = "border-rose-300"; ringColor = "stroke-rose-600";
  } else if (score >= 50) {
    label = "Envahissement fort";
    color = "text-rose-700"; bgColor = "bg-rose-50"; borderColor = "border-rose-200"; ringColor = "stroke-rose-500";
  } else if (score >= 25) {
    label = "Envahissement modéré";
    color = "text-rose-600"; bgColor = "bg-rose-50/70"; borderColor = "border-rose-200"; ringColor = "stroke-rose-400";
  } else {
    label = score > 0 ? "Envahissement faible" : "Non concernée";
    color = "text-rose-500"; bgColor = "bg-rose-50/50"; borderColor = "border-rose-100"; ringColor = "stroke-rose-300";
  }

  return { score, isInvasive, label, color, bgColor, borderColor, ringColor, drivers };
}
