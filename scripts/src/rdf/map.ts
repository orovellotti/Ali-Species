/**
 * Pure RDF mapping functions: each takes a typed DB row and returns an array of N3 Quads.
 * Kept side-effect-free so they're trivially testable and reusable.
 */
import N3 from "n3";
import {
  PREFIXES,
  id,
  vocab,
  roIriForInteraction,
} from "@workspace/rdf-vocab";
import type {
  Taxon,
  BdcStatut,
  SpeciesTraits,
  WikidataPayload,
  GlobiPayload,
  TraitField,
} from "@workspace/db";

const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;

const RDF_TYPE = namedNode(`${PREFIXES.rdf}type`);
const RDFS_LABEL = namedNode(`${PREFIXES.rdfs}label`);
const RDFS_COMMENT = namedNode(`${PREFIXES.rdfs}comment`);
const SKOS_PREF_LABEL = namedNode(`${PREFIXES.skos}prefLabel`);
const SKOS_BROADER = namedNode(`${PREFIXES.skos}broader`);
const SKOS_NOTATION = namedNode(`${PREFIXES.skos}notation`);
const OWL_SAME_AS = namedNode(`${PREFIXES.owl}sameAs`);
const DCTERMS_SOURCE = namedNode(`${PREFIXES.dcterms}source`);
const DCTERMS_BIB_CIT = namedNode(`${PREFIXES.dcterms}bibliographicCitation`);
const DCTERMS_LICENSE = namedNode(`${PREFIXES.dcterms}license`);
const DCTERMS_PUBLISHER = namedNode(`${PREFIXES.dcterms}publisher`);
const DCTERMS_TITLE = namedNode(`${PREFIXES.dcterms}title`);
const DCTERMS_DESCRIPTION = namedNode(`${PREFIXES.dcterms}description`);
const DCTERMS_ISSUED = namedNode(`${PREFIXES.dcterms}issued`);
const DCTERMS_CREATOR = namedNode(`${PREFIXES.dcterms}creator`);
const VOID_TRIPLES = namedNode(`${PREFIXES.void}triples`);
const VOID_ENTITIES = namedNode(`${PREFIXES.void}entities`);
const SCHEMA_IMAGE = namedNode(`${PREFIXES.schema}image`);

const DWC_TAXON = namedNode(`${PREFIXES.dwc}Taxon`);
const DWC_TAXON_ID = namedNode(`${PREFIXES.dwc}taxonID`);
const DWC_SCIENTIFIC_NAME = namedNode(`${PREFIXES.dwc}scientificName`);
const DWC_SCIENTIFIC_NAME_AUTH = namedNode(`${PREFIXES.dwc}scientificNameAuthorship`);
const DWC_TAXON_RANK = namedNode(`${PREFIXES.dwc}taxonRank`);
const DWC_PARENT_NAME_USAGE_ID = namedNode(`${PREFIXES.dwc}parentNameUsageID`);
const DWC_ACCEPTED_NAME_USAGE_ID = namedNode(`${PREFIXES.dwc}acceptedNameUsageID`);
const DWC_VERNACULAR_NAME = namedNode(`${PREFIXES.dwc}vernacularName`);
const DWC_KINGDOM = namedNode(`${PREFIXES.dwc}kingdom`);
const DWC_PHYLUM = namedNode(`${PREFIXES.dwc}phylum`);
const DWC_CLASS = namedNode(`${PREFIXES.dwc}class`);
const DWC_ORDER = namedNode(`${PREFIXES.dwc}order`);
const DWC_FAMILY = namedNode(`${PREFIXES.dwc}family`);
const DWC_TAXON_CONCEPT_ID = namedNode(`${PREFIXES.dwc}taxonConceptID`);
const DWC_HABITAT = namedNode(`${PREFIXES.dwc}habitat`);
const DWC_MEASUREMENT_TYPE = namedNode(`${PREFIXES.dwc}measurementType`);
const DWC_MEASUREMENT_VALUE = namedNode(`${PREFIXES.dwc}measurementValue`);
const DWC_MEASUREMENT_UNIT = namedNode(`${PREFIXES.dwc}measurementUnit`);
const DWC_MEASUREMENT_REMARKS = namedNode(`${PREFIXES.dwc}measurementRemarks`);
const DWC_MOF = namedNode(`${PREFIXES.dwc}MeasurementOrFact`);
const DWC_TAXON_REMARKS = namedNode(`${PREFIXES.dwc}taxonRemarks`);

/** Map an INPN regne string to a Wikidata kingdom, when obvious. */
const KINGDOM_DWC: Record<string, string> = {
  Animalia: "Animalia",
  Plantae: "Plantae",
  Fungi: "Fungi",
  Bacteria: "Bacteria",
  Archaea: "Archaea",
  Chromista: "Chromista",
  Protozoa: "Protozoa",
};

/** -------- TAXON -------- */
export function taxonToQuads(t: Taxon): N3.Quad[] {
  const subj = namedNode(id.taxon(t.cdNom));
  const out: N3.Quad[] = [
    quad(subj, RDF_TYPE, DWC_TAXON),
    quad(subj, DWC_TAXON_ID, literal(String(t.cdNom))),
    quad(subj, DWC_SCIENTIFIC_NAME, literal(t.lbNom)),
    // INPN canonical URI
    quad(
      subj,
      OWL_SAME_AS,
      namedNode(`https://inpn.mnhn.fr/espece/cd_nom/${t.cdNom}`),
    ),
  ];
  if (t.lbAuteur) out.push(quad(subj, DWC_SCIENTIFIC_NAME_AUTH, literal(t.lbAuteur)));
  if (t.nomComplet) out.push(quad(subj, RDFS_LABEL, literal(t.nomComplet, "la")));
  if (t.nomVern) {
    out.push(quad(subj, DWC_VERNACULAR_NAME, literal(t.nomVern, "fr")));
    out.push(quad(subj, SKOS_PREF_LABEL, literal(t.nomVern, "fr")));
  }
  if (t.nomVernEng) out.push(quad(subj, DWC_VERNACULAR_NAME, literal(t.nomVernEng, "en")));
  if (t.rang) out.push(quad(subj, DWC_TAXON_RANK, literal(t.rang)));
  if (t.cdSup && t.cdSup !== t.cdNom) {
    const parent = namedNode(id.taxon(t.cdSup));
    out.push(quad(subj, DWC_PARENT_NAME_USAGE_ID, parent));
    out.push(quad(subj, SKOS_BROADER, parent));
  }
  if (t.cdRef && t.cdRef !== t.cdNom) {
    out.push(
      quad(subj, DWC_ACCEPTED_NAME_USAGE_ID, namedNode(id.taxon(t.cdRef))),
    );
  }
  if (t.regne && KINGDOM_DWC[t.regne]) {
    out.push(quad(subj, DWC_KINGDOM, literal(KINGDOM_DWC[t.regne])));
  }
  if (t.phylum) out.push(quad(subj, DWC_PHYLUM, literal(t.phylum)));
  if (t.classe) out.push(quad(subj, DWC_CLASS, literal(t.classe)));
  if (t.ordre) out.push(quad(subj, DWC_ORDER, literal(t.ordre)));
  if (t.famille) out.push(quad(subj, DWC_FAMILY, literal(t.famille)));
  if (t.habitat) out.push(quad(subj, DWC_HABITAT, literal(t.habitat)));
  if (t.url) out.push(quad(subj, DWC_TAXON_CONCEPT_ID, namedNode(t.url)));
  if (t.fr) out.push(quad(subj, DWC_TAXON_REMARKS, literal(`statut FR: ${t.fr}`)));
  return out;
}

/** -------- BDC STATUT -------- */
export function statutToQuads(s: BdcStatut): N3.Quad[] {
  const subj = namedNode(id.statut(s.id));
  const taxonRef = namedNode(id.taxon(s.cdNom));
  const out: N3.Quad[] = [
    quad(subj, RDF_TYPE, namedNode(vocab.StatusAssertion)),
    quad(subj, RDF_TYPE, DWC_MOF),
    quad(taxonRef, namedNode(`${PREFIXES.alivocab}hasStatusAssertion`), subj),
    quad(subj, namedNode(`${PREFIXES.alivocab}aboutTaxon`), taxonRef),
    quad(subj, namedNode(vocab.statusType), namedNode(vocab.statusTypeConcept(s.cdTypeStatut))),
    quad(subj, DWC_MEASUREMENT_TYPE, literal(s.lbTypeStatut ?? s.cdTypeStatut, "fr")),
  ];
  if (s.codeStatut) out.push(quad(subj, SKOS_NOTATION, literal(s.codeStatut)));
  if (s.labelStatut) out.push(quad(subj, DWC_MEASUREMENT_VALUE, literal(s.labelStatut, "fr")));
  if (s.rqStatut) out.push(quad(subj, DWC_MEASUREMENT_REMARKS, literal(s.rqStatut, "fr")));
  if (s.cdSig) out.push(quad(subj, namedNode(vocab.territory), literal(s.cdSig)));
  if (s.lbAdmTr) out.push(quad(subj, namedNode(`${PREFIXES.alivocab}territoryLabel`), literal(s.lbAdmTr, "fr")));
  if (s.fullCitation) out.push(quad(subj, DCTERMS_BIB_CIT, literal(s.fullCitation, "fr")));
  if (s.docUrl) out.push(quad(subj, DCTERMS_SOURCE, namedNode(s.docUrl)));
  return out;
}

/** -------- TRAITS (PanTHERIA / AVONET / AmphiBIO) -------- */
const TRAIT_SOURCE_META: Record<string, { title: string; license: string; citation: string }> = {
  PanTHERIA: {
    title: "PanTHERIA — life-history, ecology, and geography of extant and recently extinct mammals",
    license: "Liberal academic (citation required)",
    citation:
      "Jones K. E. et al. 2009. PanTHERIA: a species-level database of life history, ecology, and geography of extant and recently extinct mammals. Ecology 90:2648.",
  },
  AVONET: {
    title: "AVONET — morphological, ecological and geographical data for all birds",
    license: "CC-BY 4.0",
    citation:
      "Tobias J. A. et al. 2022. AVONET: morphological, ecological and geographical data for all birds. Ecology Letters 25:581-597.",
  },
  AmphiBIO: {
    title: "AmphiBIO — natural history database of the world's amphibians",
    license: "CC-BY 4.0",
    citation:
      "Oliveira B. F. et al. 2017. AmphiBIO, a global database for amphibian ecological traits. Scientific Data 4:170123.",
  },
};

export function traitsToQuads(row: SpeciesTraits): N3.Quad[] {
  const blob = row.traits as Record<string, TraitField>;
  if (!blob || typeof blob !== "object") return [];
  const taxonRef = namedNode(id.taxon(row.cdNom));
  const sourceNode = namedNode(vocab.source(row.source));
  const out: N3.Quad[] = [];
  for (const [key, field] of Object.entries(blob)) {
    if (!field || typeof field !== "object" || !field.value) continue;
    const subj = namedNode(id.trait(row.cdNom, row.source, key));
    out.push(
      quad(subj, RDF_TYPE, namedNode(vocab.Trait)),
      quad(subj, RDF_TYPE, DWC_MOF),
      quad(taxonRef, namedNode(`${PREFIXES.alivocab}hasTrait`), subj),
      quad(subj, namedNode(`${PREFIXES.alivocab}aboutTaxon`), taxonRef),
      quad(subj, DWC_MEASUREMENT_TYPE, literal(field.label, "fr")),
      quad(subj, DWC_MEASUREMENT_VALUE, literal(String(field.value))),
      quad(subj, namedNode(vocab.fromSource), sourceNode),
    );
    if (field.unit) out.push(quad(subj, DWC_MEASUREMENT_UNIT, literal(field.unit)));
  }
  return out;
}

/** Emit one-time vocab triples describing the static trait sources. */
export function traitSourceVocabQuads(): N3.Quad[] {
  const out: N3.Quad[] = [];
  for (const [key, meta] of Object.entries(TRAIT_SOURCE_META)) {
    const subj = namedNode(vocab.source(key));
    out.push(
      quad(subj, RDF_TYPE, namedNode(`${PREFIXES.dcterms}BibliographicResource`)),
      quad(subj, DCTERMS_TITLE, literal(meta.title, "en")),
      quad(subj, DCTERMS_LICENSE, literal(meta.license)),
      quad(subj, DCTERMS_BIB_CIT, literal(meta.citation, "en")),
      quad(subj, RDFS_LABEL, literal(key)),
    );
  }
  return out;
}

/** -------- WIKIDATA CACHE -------- */
const WIKIDATA_PROP_TO_AUTHORITY: Record<string, (v: string) => string> = {
  P3151: (v) => `https://www.inaturalist.org/taxa/${v}`,
  P846: (v) => `https://www.gbif.org/species/${v}`,
  P830: (v) => `https://eol.org/pages/${v}`,
  P685: (v) => `https://www.ncbi.nlm.nih.gov/taxonomy/?term=txid${v}`,
  P815: (v) => `https://www.itis.gov/servlet/SingleRpt/SingleRpt?search_topic=TSN&search_value=${v}`,
  P10585: (v) => `https://www.catalogueoflife.org/data/taxon/${v}`,
  P850: (v) => `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${v}`,
  P5037: (v) => `https://powo.science.kew.org/taxon/${v}`,
  P961: (v) => `https://www.ipni.org/n/${v}`,
  P7715: (v) => `https://www.worldfloraonline.org/taxon/${v}`,
};

export function wikidataToQuads(cdNom: number, p: WikidataPayload): N3.Quad[] {
  if (!p) return [];
  const taxonRef = namedNode(id.taxon(cdNom));
  const out: N3.Quad[] = [];
  if (p.qid) {
    const wdNode = namedNode(`${PREFIXES.wd}${p.qid}`);
    out.push(quad(taxonRef, OWL_SAME_AS, wdNode));
    if (p.itemLabel) out.push(quad(taxonRef, RDFS_LABEL, literal(p.itemLabel, "fr")));
    if (p.itemDescription) out.push(quad(taxonRef, RDFS_COMMENT, literal(p.itemDescription, "fr")));
    if (p.imageUrl) out.push(quad(taxonRef, SCHEMA_IMAGE, namedNode(p.imageUrl)));
  }
  for (const ext of p.externalIds || []) {
    const builder = WIKIDATA_PROP_TO_AUTHORITY[ext.propertyId];
    if (builder) {
      try {
        out.push(quad(taxonRef, OWL_SAME_AS, namedNode(builder(ext.value))));
      } catch {
        // ignore malformed identifiers
      }
    }
  }
  return out;
}

/** -------- GLOBI CACHE -------- */
export function globiToQuads(cdNom: number, p: GlobiPayload): N3.Quad[] {
  if (!p || !Array.isArray(p.interactions)) return [];
  const subj = namedNode(id.taxon(cdNom));
  const out: N3.Quad[] = [];
  let counter = 0;
  for (const it of p.interactions) {
    if (!it.targetTaxonName) continue;
    const pred = namedNode(roIriForInteraction(it.interactionType));
    // If target is a known cd_nom, use that; otherwise mint a synthetic id.
    const targetKey = `${counter++}-${slug(it.targetTaxonName)}`;
    const target =
      it.targetTaxonExternalId && /^TAXREF:\d+$/.test(it.targetTaxonExternalId)
        ? namedNode(id.taxon(parseInt(it.targetTaxonExternalId.split(":")[1]!, 10)))
        : namedNode(`${PREFIXES.ali}externalTaxon/${encodeURIComponent(it.targetTaxonName)}`);
    out.push(quad(subj, pred, target));
    out.push(quad(target, RDFS_LABEL, literal(it.targetTaxonName)));
    if (counter > 1000) break; // safety cap per taxon
  }
  return out;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 64);
}

/** -------- VOID DATASET METADATA -------- */
export function voidMetadataQuads(stats: {
  taxonCount: number;
  statusCount: number;
  traitRowCount: number;
  wikidataCount: number;
  globiCount: number;
  generatedAt: string;
}): N3.Quad[] {
  const ds = namedNode(id.dataset());
  return [
    quad(ds, RDF_TYPE, namedNode(`${PREFIXES.void}Dataset`)),
    quad(ds, RDF_TYPE, namedNode(`${PREFIXES.dcat}Dataset`)),
    quad(ds, DCTERMS_TITLE, literal("ALi species — TAXREF v18 + BdC Statuts + traits + LOD links", "en")),
    quad(ds, DCTERMS_DESCRIPTION,
      literal(
        "RDF dump of the ALi species knowledge graph: TAXREF v18 taxonomy, BdC Statuts conservation/regulatory statuses, biological traits (PanTHERIA, AVONET, AmphiBIO) and pre-materialized links to Wikidata + GloBI biotic interactions.",
        "en",
      )),
    quad(ds, DCTERMS_PUBLISHER, literal("ALi species")),
    quad(ds, DCTERMS_CREATOR, literal("ALi species pipeline")),
    quad(ds, DCTERMS_LICENSE, namedNode("https://creativecommons.org/licenses/by/4.0/")),
    quad(ds, DCTERMS_ISSUED, literal(stats.generatedAt, namedNode(`${PREFIXES.xsd}dateTime`))),
    quad(ds, VOID_ENTITIES, literal(String(stats.taxonCount), namedNode(`${PREFIXES.xsd}integer`))),
    quad(ds, namedNode(`${PREFIXES.alivocab}taxonCount`), literal(String(stats.taxonCount))),
    quad(ds, namedNode(`${PREFIXES.alivocab}statusCount`), literal(String(stats.statusCount))),
    quad(ds, namedNode(`${PREFIXES.alivocab}traitRowCount`), literal(String(stats.traitRowCount))),
    quad(ds, namedNode(`${PREFIXES.alivocab}wikidataLinkCount`), literal(String(stats.wikidataCount))),
    quad(ds, namedNode(`${PREFIXES.alivocab}globiLinkCount`), literal(String(stats.globiCount))),
  ];
}
