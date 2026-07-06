import { Router, type IRouter } from "express";
import {
  fetchTaxonRow,
  fetchClassification,
  fetchStatuts,
  fetchHabref,
  fetchEunis,
} from "../lib/profileFetchers.js";
import { getTraitsBundle } from "../lib/traitsQuery.js";
import { getInteractionsForCdNom } from "./interactions.js";

const router: IRouter = Router();

export type GraphNodeType =
  | "species"
  | "ancestor"
  | "statut"
  | "habitat"
  | "trait"
  | "partner";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  sub: string | null;
  cdNom: number | null;
  rang: string | null;
  group: string | null;
}

export interface GraphLink {
  source: string;
  target: string;
  label: string | null;
  kind: GraphNodeType;
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

function truncate(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/**
 * Build a typed neighbourhood graph for a single taxon: the species itself at
 * the centre, its taxonomic lineage, conservation statuts, habitats (HABREF +
 * EUNIS), biological traits and trophic partners. Node ids are namespaced by
 * type so the frontend can merge several neighbourhoods when the user expands a
 * partner species. External blocks (EUNIS, GloBI) degrade gracefully.
 */
export async function buildSpeciesGraph(cdNom: number): Promise<SpeciesGraph | null> {
  const taxon = await fetchTaxonRow(cdNom);
  if (!taxon) return null;

  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  const centerId = `taxon:${taxon.cdNom}`;
  const centerLabel = taxon.nomVern || taxon.nomValide || taxon.lbNom;
  nodes.set(centerId, {
    id: centerId,
    type: "species",
    label: centerLabel,
    sub: taxon.nomValide || taxon.lbNom,
    cdNom: taxon.cdNom,
    rang: taxon.rang,
    group: taxon.regne,
  });

  const addNode = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addLink = (link: GraphLink) => links.push(link);

  // --- Taxonomic lineage -----------------------------------------------------
  try {
    const lineage = await fetchClassification(cdNom);
    const ancestors = lineage.filter((step) => step.cdNom !== taxon.cdNom);
    let prevId = centerId;
    // Walk from the closest ancestor up to the kingdom so links chain nicely.
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const step = ancestors[i];
      const id = `taxon:${step.cdNom}`;
      addNode({
        id,
        type: "ancestor",
        label: step.nomVern || step.lbNom,
        sub: step.rang,
        cdNom: step.cdNom,
        rang: step.rang,
        group: step.regne,
      });
      addLink({ source: prevId, target: id, label: step.rang, kind: "ancestor" });
      prevId = id;
    }
  } catch {
    /* lineage optional */
  }

  // --- Conservation / regulatory statuts ------------------------------------
  try {
    const statuts = await fetchStatuts(cdNom);
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
      addNode({
        id,
        type: "statut",
        label: truncate(s.labelStatut || code, 42),
        sub: s.lbTypeStatut,
        cdNom: null,
        rang: null,
        group: s.regroupementType || s.cdTypeStatut,
      });
      addLink({ source: centerId, target: id, label: s.cdTypeStatut, kind: "statut" });
      count++;
    }
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
      addNode({
        id,
        type: "habitat",
        label: truncate(clean, 48),
        sub: group,
        cdNom: null,
        rang: null,
        group,
      });
      addLink({ source: centerId, target: id, label: null, kind: "habitat" });
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
          addNode({
            id,
            type: "trait",
            label: truncate(`${field.label}: ${value}`, 46),
            sub: src.source,
            cdNom: null,
            rang: null,
            group: src.source,
          });
          addLink({ source: centerId, target: id, label: null, kind: "trait" });
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
          addNode({
            id,
            type: "partner",
            label: partner.nomVern || partner.name,
            sub: partner.name,
            cdNom: partner.cdNom,
            rang: partner.rang,
            group: group.label,
          });
          addLink({ source: centerId, target: id, label: group.label, kind: "partner" });
          count++;
        }
      }
    }
  } catch {
    /* interactions optional */
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
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(graph);
  } catch (err) {
    req.log.error({ err, cdNom }, "graph build failed");
    res.status(500).json({ error: "graph build failed" });
  }
});

export default router;
