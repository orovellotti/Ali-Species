// Server-side sensitivity computation (subset of taxon.tsx computeSensitivity).
// Returns score + label + drivers (no Tailwind classes — those stay client-side).
// Kept in sync with the canonical computeSensitivity in
// artifacts/taxref-explorer/src/pages/taxon.tsx — when you change the algorithm
// there, update this file too.

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
  management: number;
  drivers: ServerSensitivityDriver[];
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

export function computeSensitivityServer(statuts: ServerStatut[]): ServerSensitivity {
  let bestRedList = 0;
  let protectionScore = 0;
  let directiveScore = 0;
  let conventionScore = 0;
  let znieffScore = 0;
  let pnaScore = 0;
  let invasiveScore = 0;
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
    } else if (group === "Réglementation") {
      if (type === "REGLII" || type === "REGLLUTTE") {
        invasiveScore = Math.max(invasiveScore, 0.7);
      }
    }
  }

  const ecological = bestRedList;
  const regulatory = Math.max(protectionScore, directiveScore, conventionScore);
  const territorial = (hasZnieff || hasPna)
    ? (znieffScore + pnaScore) / ((hasZnieff ? 1 : 0) + (hasPna ? 1 : 0))
    : 0;
  const management = invasiveScore;

  const global = 0.4 * ecological + 0.3 * regulatory + 0.2 * territorial + 0.1 * management;
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
  if (invasiveScore > 0) {
    drivers.push({
      label: "EEE",
      title: "Réglementation d'introduction ou de lutte (espèce exotique envahissante)",
      kind: "invasive",
    });
  }

  let label: string;
  if (score >= 75) label = "Sensibilité critique";
  else if (score >= 50) label = "Sensibilité élevée";
  else if (score >= 25) label = "Sensibilité modérée";
  else label = "Sensibilité faible";

  return { score, label, ecological, regulatory, territorial, management, drivers };
}
