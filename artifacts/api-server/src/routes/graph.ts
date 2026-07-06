import { Router, type IRouter } from "express";
import {
  fetchTaxonRow,
  fetchClassification,
  fetchStatuts,
  fetchHabref,
  fetchEunis,
  fetchGbif,
  type ProfileStatut,
} from "../lib/profileFetchers.js";
import { getTraitsBundle } from "../lib/traitsQuery.js";
import { getInteractionsForCdNom } from "./interactions.js";

const router: IRouter = Router();

export type GraphNodeType =
  | "species"
  | "hub"
  | "ancestor"
  | "statut"
  | "habitat"
  | "trait"
  | "partner"
  | "distribution"
  | "evidence";

export type GraphTheme =
  | "ancestor"
  | "statut"
  | "habitat"
  | "trait"
  | "partner"
  | "distribution"
  | "sources";

// Filtering key used by the frontend layer toggles. Every node carries one.
export type GraphCategory =
  | "taxonomie"
  | "conservation"
  | "ecologie"
  | "traits"
  | "distribution"
  | "interactions"
  | "sources";

export type GraphLinkKind = GraphNodeType | "sources";

const HUB_LABELS: Record<GraphTheme, string> = {
  ancestor: "Taxonomie",
  statut: "Statuts",
  habitat: "Habitats",
  trait: "Traits",
  partner: "Réseau trophique",
  distribution: "Distribution",
  sources: "Sources & preuves",
};

const THEME_CATEGORY: Record<GraphTheme, GraphCategory> = {
  ancestor: "taxonomie",
  statut: "conservation",
  habitat: "ecologie",
  trait: "traits",
  partner: "interactions",
  distribution: "distribution",
  sources: "sources",
};

// Only surface the well-known ranks so the lineage reads as a short branch
// instead of dumping every intermediate clade at once.
const MAJOR_RANKS = new Set([
  "GN",
  "FM",
  "OR",
  "CL",
  "PH",
  "KD",
  "RG",
  "EM",
  "REG",
]);
const MAX_ANCESTORS = 6;

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  category: GraphCategory;
  label: string;
  sub: string | null;
  cdNom: number | null;
  rang: string | null;
  group: string | null;
  source: string | null;
  description: string | null;
  confidence: string | null;
  url: string | null;
}

export interface GraphLink {
  source: string;
  target: string;
  label: string | null;
  kind: GraphLinkKind;
}

export interface SpeciesGraph {
  center: string;
  nodes: GraphNode[];
  links: GraphLink[];
}

const MAX_STATUTS = 14;
const MAX_HABITATS = 12;
const MAX_TRAITS = 12;
const MAX_PARTNERS = 24;
const MAX_DISTRIB = 10;

// TAXREF presence code (taxons.fr) → readable French label.
const FR_PRESENCE_LABELS: Record<string, string> = {
  P: "Présent",
  E: "Endémique",
  S: "Subendémique",
  C: "Cryptogène",
  I: "Introduit",
  J: "Introduit envahissant",
  M: "Introduit non établi",
  B: "Occasionnel",
  D: "Douteux",
  A: "Absent",
  W: "Disparu",
  X: "Éteint",
  Y: "Introduit disparu ou éteint",
  Z: "Endémique disparu ou éteint",
  Q: "Signalé par erreur",
};

interface SourceMeta {
  url: string | null;
  confidence: string;
  description: string;
}

// Descriptive metadata for the "Sources & preuves" layer. Evidence nodes are
// only emitted for sources that actually contributed data to the graph.
const SOURCE_CATALOG: Record<string, SourceMeta> = {
  "TAXREF v18": {
    url: "https://inpn.mnhn.fr/programme/referentiel-taxonomique-taxref",
    confidence: "Référentiel national officiel",
    description: "Référentiel taxonomique national de la faune, la flore et la fonge de France (PatriNat / MNHN).",
  },
  "BdC Statuts v18": {
    url: "https://inpn.mnhn.fr/programme/statuts/presentation",
    confidence: "Base officielle PatriNat",
    description: "Base de connaissance des statuts (protection, menace, réglementation) des espèces de France.",
  },
  HABREF: {
    url: "https://inpn.mnhn.fr/programme/referentiel-habitats",
    confidence: "Référentiel national officiel",
    description: "Référentiel national des habitats et végétations de France (PatriNat / MNHN).",
  },
  EUNIS: {
    url: "https://eunis.eea.europa.eu/",
    confidence: "Base européenne (AEE)",
    description: "Classification européenne des habitats (Agence européenne pour l'environnement).",
  },
  GloBI: {
    url: "https://www.globalbioticinteractions.org/",
    confidence: "Agrégateur ouvert",
    description: "Global Biotic Interactions — interactions écologiques agrégées entre espèces.",
  },
  GBIF: {
    url: "https://www.gbif.org/",
    confidence: "Agrégateur mondial",
    description: "Global Biodiversity Information Facility — occurrences d'observation mondiales.",
  },
  INPN: {
    url: "https://inpn.mnhn.fr/",
    confidence: "Plateforme officielle",
    description: "Inventaire National du Patrimoine Naturel — fiches espèces de référence.",
  },
  PanTHERIA: {
    url: "https://esapubs.org/archive/ecol/E090/184/",
    confidence: "Base scientifique publiée",
    description: "Traits de cycle de vie, écologie et biogéographie des mammifères.",
  },
  AVONET: {
    url: "https://opentraits.org/datasets/avonet",
    confidence: "Base scientifique publiée",
    description: "Traits morphologiques et écologiques de l'ensemble des oiseaux du monde.",
  },
  AmphiBIO: {
    url: "https://doi.org/10.6084/m9.figshare.4644424.v5",
    confidence: "Base scientifique publiée",
    description: "Traits écologiques des amphibiens.",
  },
  Wikidata: {
    url: "https://www.wikidata.org/",
    confidence: "Base collaborative",
    description: "Base de connaissances collaborative (masse, longévité, identifiants externes).",
  },
  SquamBase: {
    url: "https://doi.org/10.6084/m9.figshare.c.6432426.v1",
    confidence: "Base scientifique publiée",
    description: "Traits écologiques et morphologiques des squamates (lézards et serpents).",
  },
};

// Trait bundles expose source ids in lowercase; map them to catalog labels.
const SOURCE_ALIASES: Record<string, string> = {
  pantheria: "PanTHERIA",
  avonet: "AVONET",
  amphibio: "AmphiBIO",
  wikidata: "Wikidata",
  squambase: "SquamBase",
};

function normalizeSourceName(raw: string): string {
  return SOURCE_ALIASES[raw.toLowerCase()] ?? raw;
}

function inpnUrl(cdNom: number): string {
  return `https://inpn.mnhn.fr/espece/cd_nom/${cdNom}`;
}

function truncate(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

function evidenceId(name: string): string {
  return `evidence:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/**
 * Build a typed neighbourhood graph for a single taxon: the species itself at
 * the centre, its taxonomic lineage, conservation statuts, habitats (HABREF +
 * EUNIS), biological traits, trophic partners, distribution and the sources
 * that back each of those. Every node carries a `category` used by the
 * frontend layer toggles, plus optional evidence fields (source, description,
 * confidence, url) surfaced in the detail panel. Node ids are namespaced by
 * type so the frontend can merge several neighbourhoods when the user expands a
 * partner species. External blocks (EUNIS, GloBI, GBIF) degrade gracefully.
 */
export async function buildSpeciesGraph(cdNom: number): Promise<SpeciesGraph | null> {
  const taxon = await fetchTaxonRow(cdNom);
  if (!taxon) return null;

  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  const makeNode = (
    partial: Partial<GraphNode> &
      Pick<GraphNode, "id" | "type" | "category" | "label">,
  ): GraphNode => ({
    sub: null,
    cdNom: null,
    rang: null,
    group: null,
    source: null,
    description: null,
    confidence: null,
    url: null,
    ...partial,
  });

  const addNode = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addLink = (link: GraphLink) => links.push(link);

  // Track which sources actually fed which themes so the "Sources & preuves"
  // layer only shows evidence for data present in this graph.
  const sourceThemes = new Map<string, Set<GraphTheme>>();
  const noteSource = (name: string | null | undefined, theme: GraphTheme) => {
    if (!name) return;
    const set = sourceThemes.get(name) ?? new Set<GraphTheme>();
    set.add(theme);
    sourceThemes.set(name, set);
  };

  const centerId = `taxon:${taxon.cdNom}`;
  const centerLabel = taxon.nomVern || taxon.nomValide || taxon.lbNom;
  nodes.set(centerId, makeNode({
    id: centerId,
    type: "species",
    category: "taxonomie",
    label: centerLabel,
    sub: taxon.nomValide || taxon.lbNom,
    cdNom: taxon.cdNom,
    rang: taxon.rang,
    group: taxon.regne,
    source: "TAXREF v18",
    description: [taxon.rang, taxon.regne].filter(Boolean).join(" · ") || null,
    url: inpnUrl(taxon.cdNom),
  }));

  // Thematic hub nodes group each family of neighbours under one labelled
  // pivot so the graph reads as clusters rather than one dense star. Created
  // lazily on first child.
  const hubIds = new Map<GraphTheme, string>();
  const hubFor = (theme: GraphTheme): string => {
    const existing = hubIds.get(theme);
    if (existing) return existing;
    const id = `hub:${taxon.cdNom}:${theme}`;
    addNode(makeNode({
      id,
      type: "hub",
      category: THEME_CATEGORY[theme],
      label: HUB_LABELS[theme],
      group: theme,
    }));
    addLink({ source: centerId, target: id, label: null, kind: theme });
    hubIds.set(theme, id);
    return id;
  };

  // --- Taxonomic lineage -----------------------------------------------------
  try {
    const lineage = await fetchClassification(cdNom);
    const ancestors = lineage.filter((step) => step.cdNom !== taxon.cdNom);
    // Prefer the classic ranks; fall back to the closest few if the lineage is
    // clade-heavy (common for plants) and no major rank matched.
    let shown = ancestors.filter((s) => s.rang && MAJOR_RANKS.has(s.rang));
    shown = shown.length > 0 ? shown.slice(-MAX_ANCESTORS) : ancestors.slice(-5);
    if (shown.length > 0) {
      noteSource("TAXREF v18", "ancestor");
      let prevId = hubFor("ancestor");
      // Walk from the closest ancestor up to the kingdom so links chain nicely.
      for (let i = shown.length - 1; i >= 0; i--) {
        const step = shown[i];
        const id = `taxon:${step.cdNom}`;
        addNode(makeNode({
          id,
          type: "ancestor",
          category: "taxonomie",
          label: step.nomVern || step.lbNom,
          sub: step.rang,
          cdNom: step.cdNom,
          rang: step.rang,
          group: step.regne,
          source: "TAXREF v18",
          description: step.rang,
          url: inpnUrl(step.cdNom),
        }));
        addLink({ source: prevId, target: id, label: step.rang, kind: "ancestor" });
        prevId = id;
      }
    }
  } catch {
    /* lineage optional */
  }

  // Statuts are reused by both the conservation and the distribution layers.
  let statuts: ProfileStatut[] = [];
  try {
    statuts = await fetchStatuts(cdNom);
  } catch {
    /* statuts optional */
  }

  // --- Conservation / regulatory statuts ------------------------------------
  try {
    const seen = new Set<string>();
    let count = 0;
    for (const s of statuts) {
      if (count >= MAX_STATUTS) break;
      const code = s.codeStatut || s.labelStatut || s.cdTypeStatut;
      if (!code) continue;
      const key = `${s.cdTypeStatut ?? ""}:${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const id = `statut:${key}`;
      addNode(makeNode({
        id,
        type: "statut",
        category: "conservation",
        label: truncate(s.labelStatut || code, 42),
        sub: s.lbTypeStatut,
        group: s.regroupementType || s.cdTypeStatut,
        source: "BdC Statuts v18",
        description: s.rqStatut || s.lbTypeStatut,
        url: s.docUrl,
      }));
      addLink({ source: hubFor("statut"), target: id, label: s.cdTypeStatut, kind: "statut" });
      count++;
    }
    if (count > 0) noteSource("BdC Statuts v18", "statut");
  } catch {
    /* statuts optional */
  }

  // --- Habitats (HABREF offline + EUNIS scraped) ----------------------------
  try {
    const seen = new Set<string>();
    let count = 0;
    const addHabitat = (label: string, group: string) => {
      if (count >= MAX_HABITATS) return;
      const clean = label.replace(/\s+/g, " ").trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const id = `habitat:${key}`;
      addNode(makeNode({
        id,
        type: "habitat",
        category: "ecologie",
        label: truncate(clean, 48),
        sub: group,
        group,
        source: group,
        description: clean,
      }));
      addLink({ source: hubFor("habitat"), target: id, label: null, kind: "habitat" });
      noteSource(group, "habitat");
      count++;
    };

    const habref = await fetchHabref(taxon.cdRef);
    for (const h of habref.habitats) {
      if (h.label) addHabitat(h.label, "HABREF");
    }

    const eunis = await fetchEunis(taxon);
    for (const h of [
      ...eunis.preferredHabitats,
      ...eunis.otherHabitats,
      ...eunis.breedingHabitats,
      ...eunis.winteringHabitats,
    ]) {
      addHabitat(h, "EUNIS");
    }
  } catch {
    /* habitats optional */
  }

  // --- Biological traits -----------------------------------------------------
  try {
    const bundle = await getTraitsBundle(cdNom);
    if (bundle) {
      let count = 0;
      for (const src of bundle.bySource) {
        for (const field of src.fields) {
          if (count >= MAX_TRAITS) break;
          const id = `trait:${cdNom}:${src.source}:${field.key}`;
          const value = field.unit ? `${field.value} ${field.unit}` : field.value;
          const srcName = normalizeSourceName(src.source);
          addNode(makeNode({
            id,
            type: "trait",
            category: "traits",
            label: truncate(`${field.label}: ${value}`, 46),
            sub: srcName,
            group: src.source,
            source: srcName,
            description: `${field.label}: ${value}`,
          }));
          addLink({ source: hubFor("trait"), target: id, label: null, kind: "trait" });
          noteSource(srcName, "trait");
          count++;
        }
      }
    }
  } catch {
    /* traits optional */
  }

  // --- Trophic partners (GloBI) ---------------------------------------------
  try {
    const interactions = await getInteractionsForCdNom(cdNom);
    if (interactions) {
      let count = 0;
      for (const group of interactions.groups) {
        for (const partner of group.partners) {
          if (count >= MAX_PARTNERS) break;
          const id = partner.cdNom ? `taxon:${partner.cdNom}` : `partner:${partner.name}`;
          addNode(makeNode({
            id,
            type: "partner",
            category: "interactions",
            label: partner.nomVern || partner.name,
            sub: partner.name,
            cdNom: partner.cdNom,
            rang: partner.rang,
            group: group.label,
            source: "GloBI",
            description: group.label,
            url: partner.cdNom ? inpnUrl(partner.cdNom) : null,
          }));
          addLink({ source: hubFor("partner"), target: id, label: group.label, kind: "partner" });
          count++;
        }
      }
      if (count > 0) noteSource("GloBI", "partner");
    }
  } catch {
    /* interactions optional */
  }

  // --- Distribution / presence ----------------------------------------------
  try {
    let count = 0;
    const addDistrib = (node: GraphNode) => {
      if (count >= MAX_DISTRIB) return;
      addNode(node);
      addLink({ source: hubFor("distribution"), target: node.id, label: null, kind: "distribution" });
      count++;
    };

    // National presence status from TAXREF.
    const frCode = taxon.fr?.trim().charAt(0).toUpperCase();
    if (frCode && FR_PRESENCE_LABELS[frCode]) {
      addDistrib(makeNode({
        id: `dist:presence:${taxon.cdNom}`,
        type: "distribution",
        category: "distribution",
        label: `France : ${FR_PRESENCE_LABELS[frCode]}`,
        sub: "Présence en France",
        group: "presence",
        source: "TAXREF v18",
        description: `Statut de présence en France métropolitaine : ${FR_PRESENCE_LABELS[frCode]}.`,
        url: inpnUrl(taxon.cdNom),
      }));
      noteSource("TAXREF v18", "distribution");
    }

    // Regional / departmental territories where the taxon carries a status.
    const territories = new Map<string, string>();
    for (const s of statuts) {
      if (!s.lbAdmTr || !s.cdSig) continue;
      if (!territories.has(s.cdSig)) territories.set(s.cdSig, s.lbAdmTr);
    }
    let terrShown = 0;
    for (const [cdSig, lb] of territories) {
      if (terrShown >= 6) break;
      addDistrib(makeNode({
        id: `dist:terr:${cdSig}`,
        type: "distribution",
        category: "distribution",
        label: truncate(lb, 40),
        sub: "Territoire",
        group: "territoire",
        source: "BdC Statuts v18",
        description: `Territoire où l'espèce fait l'objet d'un statut réglementaire ou de menace : ${lb}.`,
      }));
      if (terrShown === 0) noteSource("BdC Statuts v18", "distribution");
      terrShown++;
    }

    // Worldwide occurrences from GBIF (cached external call). Isolated so a
    // GBIF outage never drops the local INPN/presence/territory nodes below.
    try {
      const gbif = await fetchGbif(taxon);
      if (gbif.occurrenceCount != null) {
        addDistrib(makeNode({
          id: `dist:gbif:${taxon.cdNom}`,
          type: "distribution",
          category: "distribution",
          label: `Occurrences GBIF : ${gbif.occurrenceCount.toLocaleString("fr-FR")}`,
          sub: "GBIF",
          group: "gbif",
          source: "GBIF",
          description: `${gbif.occurrenceCount.toLocaleString("fr-FR")} observations recensées dans le monde (GBIF).`,
          url: gbif.gbifUrl,
        }));
        noteSource("GBIF", "distribution");
      }
    } catch {
      /* GBIF optional */
    }

    // INPN reference sheet link.
    addDistrib(makeNode({
      id: `dist:inpn:${taxon.cdNom}`,
      type: "distribution",
      category: "distribution",
      label: "Fiche INPN",
      sub: "INPN",
      group: "inpn",
      source: "INPN",
      description: "Fiche espèce de référence sur l'Inventaire National du Patrimoine Naturel.",
      url: inpnUrl(taxon.cdNom),
    }));
    noteSource("INPN", "distribution");
  } catch {
    /* distribution optional */
  }

  // --- Sources & preuves -----------------------------------------------------
  // One evidence node per source that fed the graph, linked to the sources hub
  // and to each thematic hub whose data it provided.
  if (sourceThemes.size > 0) {
    const sHub = hubFor("sources");
    for (const [name, themes] of sourceThemes) {
      const meta = SOURCE_CATALOG[name];
      const id = evidenceId(name);
      addNode(makeNode({
        id,
        type: "evidence",
        category: "sources",
        label: name,
        sub: "Source",
        group: "sources",
        source: name,
        description: meta?.description ?? "Source de données mobilisée par ALI Species.",
        confidence: meta?.confidence ?? "Source externe",
        url: meta?.url ?? null,
      }));
      addLink({ source: sHub, target: id, label: null, kind: "evidence" });
      for (const th of themes) {
        const hubId = hubIds.get(th);
        if (hubId) addLink({ source: id, target: hubId, label: null, kind: "evidence" });
      }
    }
  }

  return {
    center: centerId,
    nodes: [...nodes.values()],
    links,
  };
}

router.get("/graph/:cdNom", async (req, res): Promise<void> => {
  const cdNom = parseInt(req.params.cdNom, 10);
  if (!cdNom || Number.isNaN(cdNom)) {
    res.status(400).json({ error: "invalid cdNom" });
    return;
  }
  try {
    const graph = await buildSpeciesGraph(cdNom);
    if (!graph) {
      res.status(404).json({ error: "taxon not found" });
      return;
    }
    res.setHeader(
      "Cache-Control",
      process.env.NODE_ENV === "production"
        ? "public, max-age=3600"
        : "no-store",
    );
    res.json(graph);
  } catch (err) {
    req.log.error({ err, cdNom }, "graph build failed");
    res.status(500).json({ error: "graph build failed" });
  }
});

export default router;
