// Server-side patrimonialité (conservation value) computation.
// Returns score + label + drivers (no Tailwind classes — those stay client-side).
// Kept in sync with the canonical computeSensitivity in
// artifacts/taxref-explorer/src/lib/sensitivity.ts — when you change the
// algorithm or the barème there, update this file too.

export interface ServerStatut {
  cdTypeStatut: string | null;
  regroupementType: string | null;
  codeStatut: string | null;
  lbAdmTr: string | null;
}

export interface ServerSensitivityDriver {
  label: string;
  code?: string;
  title: string;
  /** "redlist" | "protection" | "directive" | "convention" | "znieff" | "pna" | "invasive" */
  kind: string;
}

export interface ServerSensitivity {
  score: number;
  label: string;
  ecological: number;
  regulatory: number;
  territorial: number;
  drivers: ServerSensitivityDriver[];
}

export interface ServerInvasiveness {
  score: number;
  isInvasive: boolean;
  label: string;
  drivers: ServerSensitivityDriver[];
}

// Territoire pris en compte pour l'axe écologique (Liste rouge).
// - "national" (défaut, interface) : uniquement la Liste rouge nationale (LRN).
// - { region } (API) : Liste rouge nationale (socle) + Liste rouge régionale
//   (LRR) du territoire demandé.
// La Liste rouge mondiale (LRM) et européenne (LRE) n'entrent jamais dans le
// score de patrimonialité. Doit rester synchronisé avec le calcul client
// (artifacts/taxref-explorer/src/lib/sensitivity.ts).
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

const RED_LIST_SCORES: Record<string, number> = {
  EX: 1.0, EW: 1.0, RE: 1.0,
  CR: 0.95, "CR*": 0.95,
  EN: 0.8,
  VU: 0.6,
  NT: 0.35,
  LC: 0.05,
  DD: 0.0, NE: 0.0, NA: 0.0,
};

const LR_TYPE_LONG: Record<string, string> = {
  LRN: "Liste rouge nationale",
  LRR: "Liste rouge régionale",
  LRE: "Liste rouge européenne",
  LRM: "Liste rouge mondiale",
  LRSE: "Liste rouge sous-espèce",
};

const PROT_TYPE_LONG: Record<string, string> = {
  PN: "Protection nationale",
  PR: "Protection régionale",
  PD: "Protection départementale",
  POM: "Protection outre-mer",
};

const DIR_LABEL: Record<string, string> = {
  DH: "Directive Habitats",
  DO: "Directive Oiseaux",
};

export function computeSensitivityServer(
  statuts: ServerStatut[],
  scope: SensitivityScope = NATIONAL_SCOPE,
): ServerSensitivity {
  let bestRedList = 0;
  let protectionScore = 0;
  let directiveScore = 0;
  let conventionScore = 0;
  let znieffScore = 0;
  let pnaScore = 0;
  let hasZnieff = false;
  let hasPna = false;

  const redListEntries: { type: string; code: string; territory: string; score: number }[] = [];
  const protectionEntries: { type: string; territory: string }[] = [];
  const directiveEntries: { type: string }[] = [];
  const znieffTerritories: string[] = [];
  const pnaEntries: { type: string }[] = [];
  let hasConvention = false;

  for (const s of statuts) {
    const group = s.regroupementType || "";
    const code = s.codeStatut || "";
    const type = s.cdTypeStatut || "";
    const territory = s.lbAdmTr || "";

    if (group === "Liste rouge") {
      if (!redListInScope(type, territory, scope)) continue;
      const score = RED_LIST_SCORES[code] ?? 0;
      if (score > bestRedList) bestRedList = score;
      if (score >= 0.6) {
        const dup = redListEntries.some(e => e.type === type && e.code === code && e.territory === territory);
        if (!dup) redListEntries.push({ type, code, territory, score });
      }
    } else if (group === "Protection") {
      if (type === "PN") protectionScore = Math.max(protectionScore, 1.0);
      else if (type === "PR") protectionScore = Math.max(protectionScore, 0.8);
      else if (type === "PD") protectionScore = Math.max(protectionScore, 0.7);
      else if (type === "POM") protectionScore = Math.max(protectionScore, 0.9);
      else protectionScore = Math.max(protectionScore, 0.5);
      protectionEntries.push({ type, territory });
    } else if (group === "Directives européennes") {
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
  const territorial = (hasZnieff || hasPna)
    ? (znieffScore + pnaScore) / ((hasZnieff ? 1 : 0) + (hasPna ? 1 : 0))
    : 0;

  // Patrimonialité (valeur de conservation) : la gestion/EEE n'est PAS
  // patrimoniale et n'entre pas dans ce score. L'envahissement fait l'objet d'un
  // score séparé (computeInvasivenessServer). Doit rester synchronisé avec le
  // calcul client dans artifacts/taxref-explorer/src/lib/sensitivity.ts.
  const global = 0.5 * ecological + 0.3 * regulatory + 0.2 * territorial;
  const score = Math.round(global * 100);

  const drivers: ServerSensitivityDriver[] = [];

  redListEntries.sort((a, b) => b.score - a.score);
  for (const lr of redListEntries) {
    drivers.push({
      label: `${lr.type} ${lr.code}`,
      code: lr.code,
      title: `${LR_TYPE_LONG[lr.type] || lr.type} (${lr.territory || "—"}) : ${lr.code}`,
      kind: "redlist",
    });
  }
  const protSeen = new Set<string>();
  for (const p of protectionEntries) {
    if (protSeen.has(p.type)) continue;
    protSeen.add(p.type);
    drivers.push({
      label: p.type,
      title: `${PROT_TYPE_LONG[p.type] || "Protection"}${p.territory ? ` (${p.territory})` : ""}`,
      kind: "protection",
    });
  }
  const dirSeen = new Set<string>();
  for (const d of directiveEntries) {
    if (dirSeen.has(d.type)) continue;
    dirSeen.add(d.type);
    drivers.push({
      label: DIR_LABEL[d.type] || `Directive ${d.type}`,
      title: DIR_LABEL[d.type] || `Directive européenne ${d.type}`,
      kind: "directive",
    });
  }
  if (hasConvention) {
    drivers.push({
      label: "Convention",
      title: "Convention internationale (Berne, Bonn, Barcelone, OSPAR, CITES…)",
      kind: "convention",
    });
  }
  if (hasZnieff) {
    const uniq = Array.from(new Set(znieffTerritories));
    drivers.push({
      label: uniq.length === 1 ? `ZNIEFF (${uniq[0]})` : "ZNIEFF",
      title: uniq.length > 0 ? `Déterminante ZNIEFF — ${uniq.join(", ")}` : "Déterminante ZNIEFF",
      kind: "znieff",
    });
  }
  if (hasPna) {
    const isActive = pnaEntries.some(p => p.type === "PNA");
    drivers.push({
      label: isActive ? "PNA" : "exPNA",
      title: isActive ? "Plan national d'actions (en cours)" : "Plan national d'actions (terminé)",
      kind: "pna",
    });
  }
  let label: string;
  if (score >= 75) label = "Patrimonialité majeure";
  else if (score >= 50) label = "Patrimonialité forte";
  else if (score >= 25) label = "Patrimonialité modérée";
  else label = "Patrimonialité faible";

  return { score, label, ecological, regulatory, territorial, drivers };
}

// Score d'envahissement (0-100), SÉPARÉ de la patrimonialité (les deux ne se
// mélangent pas). Basé sur la réglementation exotique envahissante :
//  - REGLLUTTE (obligation de lutte) = signal le plus fort ; code EEEUE =
//    espèce exotique envahissante de l'Union européenne (règlement 2016/1141).
//  - REGLII (interdiction d'introduction) ; code FRnoEEE* = liste métropolitaine.
//  - Bonus d'étendue : nombre de territoires distincts réglementés.
// Doit rester synchronisé avec le calcul client (sensitivity.ts).
export function computeInvasivenessServer(statuts: ServerStatut[]): ServerInvasiveness {
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

  const drivers: ServerSensitivityDriver[] = [];
  if (hasFight) {
    drivers.push({
      label: hasEuFight ? "EEE Union européenne" : "Lutte obligatoire",
      title: hasEuFight
        ? "Espèce exotique envahissante de l'Union européenne (règlement 2016/1141) — obligation de lutte"
        : "Obligation de lutte contre une espèce exotique envahissante",
      kind: "invasive",
    });
  }
  if (hasBan) {
    drivers.push({
      label: hasMetroBan ? "Interdite (métropole)" : "Introduction interdite",
      title: hasMetroBan
        ? "Interdiction d'introduction sur le territoire métropolitain (espèce exotique envahissante)"
        : "Interdiction d'introduction (espèce exotique envahissante)",
      kind: "invasive",
    });
  }
  if (territories.size > 1) {
    drivers.push({
      label: `${territories.size} territoires`,
      title: `Réglementée dans ${territories.size} territoires`,
      kind: "invasive",
    });
  }

  let label: string;
  if (score >= 75) label = "Envahissement majeur";
  else if (score >= 50) label = "Envahissement fort";
  else if (score >= 25) label = "Envahissement modéré";
  else if (score > 0) label = "Envahissement faible";
  else label = "Non concernée";

  return { score, isInvasive, label, drivers };
}
