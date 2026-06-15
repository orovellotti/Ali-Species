import type { TaxonMedia, GbifInfo } from "@workspace/api-client-react";
import { formatRank, taxonUrl } from "@/lib/constants";

type ClassificationNode = { cdNom: number; lbNom: string; rang?: string | null };

// Structural shape (rather than the generated TaxonProfile["taxon"]) so the
// helper accepts both the profile payload and the per-block fallback type.
type SeoTaxon = {
  cdNom: number;
  lbNom: string;
  nomComplet?: string | null;
  nomVern?: string | null;
  classe?: string | null;
  ordre?: string | null;
  famille?: string | null;
  rang?: string | null;
  cdRef?: number | null;
};

/**
 * Build the rich SEO payload for a taxon page: page title/description tuned to
 * rank on scientific-name searches, canonical URL, OG image, and Taxon +
 * BreadcrumbList JSON-LD. Pure function (reads only browser globals), so the
 * page component can stay focused on rendering.
 */
export function buildTaxonSeo({
  taxon,
  classification,
  gbif,
  media,
}: {
  taxon: SeoTaxon;
  classification: ClassificationNode[] | undefined;
  gbif: GbifInfo | undefined;
  media: TaxonMedia | undefined;
}) {
  // Title puts the scientific name first (italics in the H1, plain here), then
  // vernacular in parentheses, then site name. Google reads the first 50-60
  // chars most heavily.
  const vernFirst = taxon.nomVern ? taxon.nomVern.split(",")[0].trim() : "";
  const pageTitle = `${taxon.lbNom}${vernFirst ? ` (${vernFirst})` : ""} — ALi Species`;

  // Description packed with classification + status, in French, mentioning
  // "France" and "TAXREF v18" for geo + dataset authority signals.
  const descParts: string[] = [];
  descParts.push(`${taxon.nomComplet || taxon.lbNom}${vernFirst ? `, « ${vernFirst} »` : ""}`);
  const classifBits = [taxon.classe, taxon.ordre, taxon.famille].filter(Boolean);
  if (classifBits.length > 0) descParts.push(classifBits.join(" › "));
  descParts.push(`${formatRank(taxon.rang)} de la faune et flore de France (TAXREF v18).`);
  descParts.push("Classification, statuts de conservation (Liste rouge, protection, directives), interactions trophiques, traits écologiques et images.");
  const pageDescription = descParts.join(" — ");

  const firstImage = media?.images?.[0]?.url;
  const canonicalPath = taxonUrl(taxon.cdNom, taxon.lbNom);
  const canonicalUrl = `${window.location.origin}${import.meta.env.BASE_URL}${canonicalPath.slice(1)}`;

  // sameAs identifiers: INPN URL is deterministic from cdNom (always present).
  // These are critical for Google's Knowledge Graph entity resolution — they
  // tell Google "this page is about the same entity as the Wikidata/GBIF/INPN
  // record", which boosts ranking on the scientific name query.
  const inpnUrl = `https://inpn.mnhn.fr/espece/cd_nom/${taxon.cdNom}`;
  // Prefer the canonical GBIF species URL (/species/{key}) when we know the
  // GBIF key — it's a strong entity-identity signal. Fall back to a search
  // URL only when the GBIF match hasn't loaded yet (weaker signal but still
  // points to the right entity at GBIF).
  const gbifUrl = gbif?.gbifUrl
    || (gbif?.gbifKey ? `https://www.gbif.org/species/${gbif.gbifKey}` : `https://www.gbif.org/species/search?q=${encodeURIComponent(taxon.lbNom)}`);
  const sameAs = [inpnUrl, gbifUrl];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Taxon",
    "@id": canonicalUrl,
    name: taxon.lbNom,
    alternateName: taxon.nomVern ? taxon.nomVern.split(",").map((n: string) => n.trim()) : undefined,
    taxonRank: taxon.rang ? formatRank(taxon.rang) : undefined,
    scientificName: taxon.nomComplet || taxon.lbNom,
    parentTaxon: classification && classification.length > 1 ? {
      "@type": "Taxon",
      name: classification[classification.length - 2]?.lbNom,
      taxonRank: classification[classification.length - 2]?.rang ? formatRank(classification[classification.length - 2].rang!) : undefined,
    } : undefined,
    image: firstImage || undefined,
    url: canonicalUrl,
    sameAs,
    inLanguage: ["fr", "la"],
    description: pageDescription,
    identifier: [
      { "@type": "PropertyValue", name: "CD_NOM", value: taxon.cdNom, propertyID: "https://inpn.mnhn.fr/espece/cd_nom" },
      { "@type": "PropertyValue", name: "CD_REF", value: taxon.cdRef ?? taxon.cdNom },
    ],
    isPartOf: {
      "@type": "Dataset",
      name: "TAXREF v18",
      creator: { "@type": "Organization", name: "PatriNat (OFB - MNHN - CNRS - IRD)" },
      url: "https://inpn.mnhn.fr/programme/referentiel-taxonomique-taxref",
    },
  };

  // BreadcrumbList JSON-LD for the rich-result breadcrumb in SERPs.
  const breadcrumbItems = classification && classification.length > 0
    ? classification.map((node, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: node.lbNom,
        item: `${window.location.origin}${import.meta.env.BASE_URL}${taxonUrl(node.cdNom, node.lbNom).slice(1)}`,
      }))
    : [];
  const breadcrumbJsonLd = breadcrumbItems.length > 1 ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  } : null;

  return { pageTitle, pageDescription, canonicalUrl, firstImage, jsonLd, breadcrumbJsonLd };
}
