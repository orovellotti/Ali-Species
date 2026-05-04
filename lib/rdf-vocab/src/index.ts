/**
 * RDF vocabulary constants and URI helpers for ALi species.
 *
 * Standards we lean on:
 * - Darwin Core (TDWG) for the taxonomic backbone — http://rs.tdwg.org/dwc/terms/
 * - SKOS for hierarchical labels — http://www.w3.org/2004/02/skos/core#
 * - OWL for sameAs links to LOD authorities (Wikidata, GBIF, INPN…)
 * - Relations Ontology (RO) for biotic interactions (the vocabulary GloBI itself uses)
 * - DCTERMS / DCAT / VOID for dataset metadata
 * - Schema.org as a fallback for image / description (shared with Wikidata's payload)
 */

export const ALI_BASE = "https://ali-species.app";

export const PREFIXES = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dwc: "http://rs.tdwg.org/dwc/terms/",
  dwciri: "http://rs.tdwg.org/dwc/iri/",
  dcterms: "http://purl.org/dc/terms/",
  dcat: "http://www.w3.org/ns/dcat#",
  void: "http://rdfs.org/ns/void#",
  foaf: "http://xmlns.com/foaf/0.1/",
  schema: "https://schema.org/",
  ro: "http://purl.obolibrary.org/obo/RO_",
  wd: "http://www.wikidata.org/entity/",
  wdt: "http://www.wikidata.org/prop/direct/",
  ali: `${ALI_BASE}/id/`,
  alivocab: `${ALI_BASE}/vocab/`,
} as const;

/** Build the @prefix preamble for a Turtle document. */
export function turtlePrefixes(extra: Record<string, string> = {}): string {
  const merged = { ...PREFIXES, ...extra };
  return Object.entries(merged)
    .map(([p, iri]) => `@prefix ${p}: <${iri}> .`)
    .join("\n");
}

/** URI builders — keep these consistent across mappers. */
export const id = {
  /** TAXREF taxon resource (cd_nom is the stable INPN identifier). */
  taxon: (cdNom: number) => `${PREFIXES.ali}taxon/${cdNom}`,
  /** Conservation / regulatory status assertion (BdC Statuts row id). */
  statut: (rowId: number) => `${PREFIXES.ali}statut/${rowId}`,
  /** A single trait measurement (deterministic key from cd_nom + source + key). */
  trait: (cdNom: number, source: string, key: string) =>
    `${PREFIXES.ali}trait/${cdNom}/${encodeURIComponent(source)}/${encodeURIComponent(key)}`,
  /** A biotic interaction edge between two taxons. */
  interaction: (subjectCdNom: number, predicate: string, objectKey: string) =>
    `${PREFIXES.ali}interaction/${subjectCdNom}/${encodeURIComponent(predicate)}/${encodeURIComponent(objectKey)}`,
  /** Dataset itself (VOID / DCAT). */
  dataset: () => `${PREFIXES.ali}dataset`,
};

export const vocab = {
  /** Class for our trait dataset (subclass of dwc:MeasurementOrFact). */
  Trait: `${PREFIXES.alivocab}Trait`,
  /** Class for a regulatory / conservation status assertion. */
  StatusAssertion: `${PREFIXES.alivocab}StatusAssertion`,
  /** Class for a biotic interaction. */
  Interaction: `${PREFIXES.alivocab}Interaction`,
  /** Property: the trait was sourced from this dataset (PanTHERIA / AVONET / ...). */
  fromSource: `${PREFIXES.alivocab}fromSource`,
  /** Property: the status type code (LRN, LRR, REGLLUTTE, …). */
  statusType: `${PREFIXES.alivocab}statusType`,
  /** Property: territorial scope of the status (FR, REU, NC, …). */
  territory: `${PREFIXES.alivocab}territory`,
  /** Source (PanTHERIA, AVONET, …) as a vocab term. */
  source: (key: string) => `${PREFIXES.alivocab}source/${encodeURIComponent(key)}`,
  /** Status type as a SKOS concept. */
  statusTypeConcept: (code: string) =>
    `${PREFIXES.alivocab}statusType/${encodeURIComponent(code)}`,
};

/**
 * Maps GloBI / Anage interaction labels to Relations Ontology IRIs.
 * Reference: https://github.com/jhpoelen/eol-globi-data/blob/master/eol-globi-rdf/src/main/resources/interaction_types.csv
 */
export const RO_INTERACTIONS: Record<string, string> = {
  preysOn: `${PREFIXES.ro}0002439`,
  preyedUponBy: `${PREFIXES.ro}0002458`,
  eats: `${PREFIXES.ro}0002470`,
  eatenBy: `${PREFIXES.ro}0002471`,
  hostOf: `${PREFIXES.ro}0002453`,
  hasHost: `${PREFIXES.ro}0002454`,
  parasiteOf: `${PREFIXES.ro}0002444`,
  hasParasite: `${PREFIXES.ro}0002445`,
  ectoparasiteOf: `${PREFIXES.ro}0002632`,
  hasEctoparasite: `${PREFIXES.ro}0002633`,
  endoparasiteOf: `${PREFIXES.ro}0002634`,
  hasEndoparasite: `${PREFIXES.ro}0002635`,
  pathogenOf: `${PREFIXES.ro}0002556`,
  pollinates: `${PREFIXES.ro}0002455`,
  pollinatedBy: `${PREFIXES.ro}0002456`,
  visits: `${PREFIXES.ro}0002618`,
  visitedBy: `${PREFIXES.ro}0002619`,
  mutualistOf: `${PREFIXES.ro}0002442`,
  symbiontOf: `${PREFIXES.ro}0002440`,
  interactsWith: `${PREFIXES.ro}0002437`,
};

export function roIriForInteraction(label: string): string {
  return RO_INTERACTIONS[label] ?? RO_INTERACTIONS.interactsWith;
}

/** Sanitise text for a Turtle string literal. n3 escapes for us, but we keep this helper for prebuilt strings. */
export function tt(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
