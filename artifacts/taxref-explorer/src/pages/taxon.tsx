import { Layout } from "@/components/Layout";
import { 
  useGetTaxon, 
  useGetTaxonClassification, 
  useGetTaxonMedia, 
  useGetTaxonChildren,
  useGetTaxonWikipedia,
  useGetTaxonGbif,
  useGetTaxonStatuts,
  getGetTaxonQueryKey,
  getGetTaxonClassificationQueryKey,
  getGetTaxonMediaQueryKey,
  getGetTaxonChildrenQueryKey,
  getGetTaxonWikipediaQueryKey,
  getGetTaxonGbifQueryKey,
  getGetTaxonStatutsQueryKey
} from "@workspace/api-client-react";
import type { BdcStatut } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { formatRank, formatHabitat, formatStatus } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, ChevronDown, Image as ImageIcon, MapPin, Tag, Globe, FileText, Layers, Link2, BookOpen, BarChart3, ExternalLink, Shield, ScrollText, Activity, AlertTriangle, Info, Users } from "lucide-react";
import { useState, useMemo, type ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { Badge } from "@/components/ui/badge";

function CollapsibleSection({ icon, title, count, children, defaultOpen = false, className = "" }: {
  icon: ReactNode;
  title: string;
  count?: number | string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-card rounded-2xl border border-border shadow-sm overflow-hidden ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-5 text-left hover:bg-muted/30 transition-colors"
      >
        {icon}
        <span className="text-sm font-semibold text-foreground uppercase tracking-wider flex-1">{title}</span>
        {count != null && (
          <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/50 pt-4">{children}</div>}
    </div>
  );
}

export default function TaxonDetail() {
  const params = useParams();
  const cdNom = parseInt(params.cdNom || "0", 10);

  const { data: taxon, isLoading: taxonLoading } = useGetTaxon(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonQueryKey(cdNom) } });
  const { data: classification, isLoading: classLoading } = useGetTaxonClassification(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonClassificationQueryKey(cdNom) } });
  const { data: media, isLoading: mediaLoading } = useGetTaxonMedia(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonMediaQueryKey(cdNom) } });
  const { data: children, isLoading: childrenLoading } = useGetTaxonChildren(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonChildrenQueryKey(cdNom) } });
  const { data: wikipedia, isLoading: wikiLoading } = useGetTaxonWikipedia(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonWikipediaQueryKey(cdNom) } });
  const { data: gbif, isLoading: gbifLoading } = useGetTaxonGbif(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonGbifQueryKey(cdNom) } });
  const { data: statuts, isLoading: statutsLoading } = useGetTaxonStatuts(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonStatutsQueryKey(cdNom) } });

  if (taxonLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-5xl">
          <Skeleton className="h-6 w-64 mb-8" />
          <div className="grid md:grid-cols-3 gap-10">
            <div className="md:col-span-2 space-y-6">
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-40 w-full" />
            </div>
            <div>
              <Skeleton className="h-80 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!taxon) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center max-w-xl">
          <h1 className="text-3xl font-serif text-foreground mb-4">Taxon introuvable</h1>
          <p className="text-muted-foreground mb-8">Aucun enregistrement trouve pour l'identifiant {cdNom}.</p>
          <Link href="/" className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors">
            Retour a l'accueil
          </Link>
        </div>
      </Layout>
    );
  }

  const hasImages = media && media.images && media.images.length > 0;

  const pageTitle = `${taxon.lbNom}${taxon.nomVern ? ` (${taxon.nomVern.split(",")[0].trim()})` : ""} – ALi species`;
  const pageDescription = `${taxon.lbNom}${taxon.lbAuteur ? ` ${taxon.lbAuteur}` : ""}${taxon.nomVern ? ` — ${taxon.nomVern}` : ""}. ${formatRank(taxon.rang)} du referentiel taxonomique TAXREF v18. Classification, statuts de conservation, donnees GBIF et images.`;
  const firstImage = media?.images?.[0]?.url;
  const canonicalUrl = `${window.location.origin}${import.meta.env.BASE_URL}taxon/${taxon.cdNom}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Taxon",
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
    identifier: {
      "@type": "PropertyValue",
      name: "CD_NOM",
      value: taxon.cdNom,
    },
    isPartOf: {
      "@type": "Dataset",
      name: "TAXREF v18",
      creator: { "@type": "Organization", name: "PatriNat (OFB - MNHN - CNRS - IRD)" },
    },
  };

  return (
    <Layout>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        {firstImage && <meta property="og:image" content={firstImage} />}
        <meta name="twitter:card" content={firstImage ? "summary_large_image" : "summary"} />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        {firstImage && <meta name="twitter:image" content={firstImage} />}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <div className="bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 py-2 max-w-6xl overflow-x-auto scrollbar-hide">
          <div className="flex items-center text-xs flex-wrap gap-y-1">
            {classLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : classification && classification.length > 0 ? (
              (() => {
                const mainRanks = ["KD", "PH", "CL", "OR", "FM", "GN", "ES", "SSES"];
                const filtered = classification.filter(n => n.rang ? mainRanks.includes(n.rang) : false);
                const items = filtered.length > 0 ? filtered : classification.slice(-5);
                return items.map((node, i) => (
                  <div key={node.cdNom} className="flex items-center">
                    <Link 
                      href={`/taxon/${node.cdNom}`}
                      className="hover:text-primary hover:underline underline-offset-4 text-muted-foreground transition-colors flex items-center gap-1"
                    >
                      <span className="text-[9px] font-medium text-foreground/60 uppercase">{node.rang}</span>
                      <span className="truncate max-w-[120px]">{node.lbNom}</span>
                    </Link>
                    {i < items.length - 1 && (
                      <ChevronRight className="w-3 h-3 mx-1 text-muted-foreground/40 shrink-0" />
                    )}
                  </div>
                ));
              })()
            ) : (
              <span className="text-muted-foreground">Classification racine</span>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="grid lg:grid-cols-[1fr_400px] gap-12 items-start">
          
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Badge variant="secondary" className="font-mono text-xs tracking-wider uppercase bg-primary/10 text-primary hover:bg-primary/20">
                  {formatRank(taxon.rang)}
                </Badge>
                <span className="text-sm font-mono text-muted-foreground">CD_NOM: {taxon.cdNom}</span>
                {taxon.cdRef !== taxon.cdNom && (
                  <span className="text-sm font-mono text-muted-foreground">CD_REF: {taxon.cdRef}</span>
                )}
              </div>
              
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-2 italic" data-testid="text-taxon-name" lang="la">
                {taxon.lbNom}
              </h1>
              
              {taxon.lbAuteur && (
                <p className="text-lg text-muted-foreground font-serif">
                  {taxon.lbAuteur}
                </p>
              )}

              {taxon.nomVern && (
                <p className="text-base text-foreground/70 mt-1">{taxon.nomVern}</p>
              )}

              {taxon.nomValide && taxon.nomValide !== taxon.nomComplet && taxon.cdRef !== taxon.cdNom && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Link2 className="w-4 h-4 text-amber-600" />
                    <span className="font-medium text-amber-800 dark:text-amber-400">Synonyme</span>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Nom valide de reference :{" "}
                    <Link href={`/taxon/${taxon.cdRef}`} className="italic underline underline-offset-4 hover:text-amber-900">
                      {taxon.nomValide}
                    </Link>
                  </p>
                </div>
              )}
            </div>

            {statutsLoading ? (
              <Skeleton className="h-32 w-full rounded-2xl" />
            ) : statuts && statuts.length > 0 ? (
              <SensitivityScorePanel statuts={statuts} />
            ) : null}

            <div className="flex flex-wrap gap-2 text-sm">
              {taxon.group1Inpn && (
                <span className="px-3 py-1.5 bg-primary/10 text-primary rounded-full font-medium">{taxon.group1Inpn}</span>
              )}
              {taxon.group2Inpn && (
                <span className="px-3 py-1.5 bg-primary/10 text-primary rounded-full font-medium">{taxon.group2Inpn}</span>
              )}
              {taxon.habitat && (
                <span className="px-3 py-1.5 bg-muted text-muted-foreground rounded-full font-medium flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" />{formatHabitat(taxon.habitat)}
                </span>
              )}
              {taxon.fr && (
                <span className="px-3 py-1.5 bg-muted text-muted-foreground rounded-full font-medium flex items-center gap-1.5">
                  <Globe className="w-3 h-3" />{formatStatus(taxon.fr)}
                </span>
              )}
              {gbif?.iucnCategoryLabel && (
                <span className={`px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 ${
                  gbif.iucnCategory === "CR" || gbif.iucnCategory === "CRITICALLY_ENDANGERED" ? "bg-red-100 text-red-800" :
                  gbif.iucnCategory === "EN" || gbif.iucnCategory === "ENDANGERED" ? "bg-orange-100 text-orange-800" :
                  gbif.iucnCategory === "VU" || gbif.iucnCategory === "VULNERABLE" ? "bg-yellow-100 text-yellow-800" :
                  gbif.iucnCategory === "NT" || gbif.iucnCategory === "NEAR_THREATENED" ? "bg-amber-100 text-amber-800" :
                  "bg-green-100 text-green-800"
                }`}>
                  <Shield className="w-3 h-3" />UICN: {gbif.iucnCategory}
                </span>
              )}
              {gbif?.occurrenceCount != null && (
                <span className="px-3 py-1.5 bg-muted text-muted-foreground rounded-full font-medium flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3" />{gbif.occurrenceCount.toLocaleString("fr-FR")} obs. GBIF
                </span>
              )}
            </div>

            {wikiLoading ? (
              <Skeleton className="h-20 w-full rounded-2xl" />
            ) : wikipedia?.extract ? (
              <CollapsibleSection
                icon={<BookOpen className="w-4 h-4 text-primary" />}
                title="Description"
                defaultOpen={true}
              >
                <p className="text-muted-foreground leading-relaxed">{wikipedia.extract}</p>
                {wikipedia.url && (
                  <a
                    href={wikipedia.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:underline underline-offset-4"
                  >
                    Lire sur Wikipedia
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </CollapsibleSection>
            ) : null}

            <CollapsibleSection
              icon={<FileText className="w-4 h-4 text-primary" />}
              title="Informations taxonomiques"
              defaultOpen={false}
            >
              <div className="grid sm:grid-cols-2 gap-6">
                {(taxon.nomVern || taxon.nomVernEng) && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                      <Tag className="w-4 h-4 text-primary" />
                      Noms vernaculaires
                    </div>
                    <div className="space-y-2">
                      {taxon.nomVern && (
                        <div className="text-muted-foreground">
                          <span className="text-xs font-medium uppercase mr-2 text-foreground/50">FR</span>
                          {taxon.nomVern}
                        </div>
                      )}
                      {taxon.nomVernEng && (
                        <div className="text-muted-foreground">
                          <span className="text-xs font-medium uppercase mr-2 text-foreground/50">EN</span>
                          {taxon.nomVernEng}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  {taxon.habitat && (
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2 uppercase tracking-wider">
                        <MapPin className="w-4 h-4 text-primary" />
                        Habitat
                      </div>
                      <div className="text-muted-foreground">{formatHabitat(taxon.habitat)}</div>
                    </div>
                  )}
                  {taxon.fr && (
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2 uppercase tracking-wider">
                        <Globe className="w-4 h-4 text-primary" />
                        Statut en France
                      </div>
                      <div className="text-muted-foreground">{formatStatus(taxon.fr)}</div>
                    </div>
                  )}
                  {taxon.nomComplet && (
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2 uppercase tracking-wider">
                        <FileText className="w-4 h-4 text-primary" />
                        Nom complet
                      </div>
                      <div className="text-muted-foreground italic text-sm">{taxon.nomComplet}</div>
                    </div>
                  )}
                  {(taxon.group1Inpn || taxon.group2Inpn || taxon.group3Inpn) && (
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2 uppercase tracking-wider">
                        <Layers className="w-4 h-4 text-primary" />
                        Groupes INPN
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {taxon.group1Inpn && <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">{taxon.group1Inpn}</span>}
                        {taxon.group2Inpn && <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">{taxon.group2Inpn}</span>}
                        {taxon.group3Inpn && <span className="px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs font-medium">{taxon.group3Inpn}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleSection>

            {gbifLoading ? (
              <Skeleton className="h-16 w-full rounded-2xl" />
            ) : gbif?.gbifKey ? (
              <CollapsibleSection
                icon={<BarChart3 className="w-4 h-4 text-primary" />}
                title="Donnees GBIF"
                defaultOpen={false}
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  {gbif.occurrenceCount != null && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Globe className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-foreground">{gbif.occurrenceCount.toLocaleString("fr-FR")}</div>
                        <div className="text-xs text-muted-foreground">Observations mondiales</div>
                      </div>
                    </div>
                  )}
                  {gbif.iucnCategoryLabel && (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        gbif.iucnCategory === "CR" || gbif.iucnCategory === "CRITICALLY_ENDANGERED" ? "bg-red-100 dark:bg-red-950" :
                        gbif.iucnCategory === "EN" || gbif.iucnCategory === "ENDANGERED" ? "bg-orange-100 dark:bg-orange-950" :
                        gbif.iucnCategory === "VU" || gbif.iucnCategory === "VULNERABLE" ? "bg-yellow-100 dark:bg-yellow-950" :
                        gbif.iucnCategory === "NT" || gbif.iucnCategory === "NEAR_THREATENED" ? "bg-amber-100 dark:bg-amber-950" :
                        "bg-green-100 dark:bg-green-950"
                      }`}>
                        <Shield className={`w-5 h-5 ${
                          gbif.iucnCategory === "CR" || gbif.iucnCategory === "CRITICALLY_ENDANGERED" ? "text-red-600" :
                          gbif.iucnCategory === "EN" || gbif.iucnCategory === "ENDANGERED" ? "text-orange-600" :
                          gbif.iucnCategory === "VU" || gbif.iucnCategory === "VULNERABLE" ? "text-yellow-600" :
                          gbif.iucnCategory === "NT" || gbif.iucnCategory === "NEAR_THREATENED" ? "text-amber-600" :
                          "text-green-600"
                        }`} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-foreground">{gbif.iucnCategoryLabel}</div>
                        <div className="text-xs text-muted-foreground">Statut UICN</div>
                      </div>
                    </div>
                  )}
                </div>
                {gbif.gbifUrl && (
                  <a
                    href={gbif.gbifUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:underline underline-offset-4"
                  >
                    Voir sur GBIF.org
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </CollapsibleSection>
            ) : null}

            {statutsLoading ? (
              <Skeleton className="h-40 w-full rounded-2xl" />
            ) : statuts && statuts.length > 0 ? (
              <StatutsSection statuts={statuts} />
            ) : null}

            {childrenLoading ? (
              <Skeleton className="h-14 w-full rounded-2xl" />
            ) : children && children.length > 0 ? (
              <CollapsibleSection
                icon={<Users className="w-4 h-4 text-primary" />}
                title="Taxons subordonnes"
                count={children.length}
                defaultOpen={children.length <= 10}
              >
                <div className="grid sm:grid-cols-2 gap-3">
                  {children.map(child => (
                    <Link 
                      key={child.cdNom} 
                      href={`/taxon/${child.cdNom}`}
                      className="flex items-center justify-between p-3 bg-background border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all group"
                      data-testid={`link-child-${child.cdNom}`}
                    >
                      <div className="truncate pr-4">
                        <div className="font-medium text-foreground truncate italic text-sm">{child.lbNom}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <span className="uppercase text-[10px] font-bold tracking-wider">{formatRank(child.rang)}</span>
                          {child.nomVern && <span className="truncate">- {child.nomVern}</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </Link>
                  ))}
                </div>
              </CollapsibleSection>
            ) : (
              <div className="text-center py-6 bg-muted/30 rounded-2xl border border-dashed border-border text-muted-foreground text-sm">
                Aucun taxon subordonne.
              </div>
            )}
          </div>

          <div className="space-y-6">
            {mediaLoading ? (
              <Skeleton className="w-full aspect-[4/3] rounded-2xl" />
            ) : hasImages ? (
              <div className="space-y-4">
                {media.images.map((img, i) => (
                  <div key={i} className="group relative rounded-2xl overflow-hidden bg-muted border border-border shadow-sm">
                    <img 
                      src={img.url} 
                      alt={img.title || taxon.lbNom} 
                      className="w-full h-auto object-cover object-center max-h-[500px]"
                      loading={i === 0 ? "eager" : "lazy"}
                      data-testid={`img-taxon-${i}`}
                    />
                    {(img.title || img.author) && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                        {img.title && <p className="text-white text-sm font-medium line-clamp-1">{img.title}</p>}
                        {img.author && <p className="text-white/80 text-xs mt-1">{img.author}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="aspect-[4/3] rounded-2xl bg-muted border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                <p>Aucune image disponible pour ce taxon.</p>
              </div>
            )}

            {taxon.url && (
              <a 
                href={taxon.url} 
                target="_blank" 
                rel="noreferrer"
                className="block w-full py-4 px-6 bg-card hover:bg-muted text-center border border-border rounded-xl font-medium transition-colors"
                data-testid="link-inpn"
              >
                Voir sur le site INPN
              </a>
            )}
          </div>

        </div>
      </div>
    </Layout>
  );
}

const REGROUPEMENT_ORDER = [
  "Liste rouge",
  "Protection",
  "Directives européennes",
  "Conventions internationales",
  "Réglementation",
  "Plan national",
  "ZNIEFF",
  "SENSIBILITE",
];

const REGROUPEMENT_COLORS: Record<string, string> = {
  "Liste rouge": "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20",
  "Protection": "border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20",
  "Directives européennes": "border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20",
  "Conventions internationales": "border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20",
  "Réglementation": "border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20",
  "Plan national": "border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20",
  "ZNIEFF": "border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20",
  "SENSIBILITE": "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20",
};

const REGROUPEMENT_BADGE: Record<string, string> = {
  "Liste rouge": "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  "Protection": "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  "Directives européennes": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300",
  "Conventions internationales": "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  "Réglementation": "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
  "Plan national": "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300",
  "ZNIEFF": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  "SENSIBILITE": "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
};

const LR_CODE_COLORS: Record<string, string> = {
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

interface SensitivityResult {
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
  drivers: { label: string; badgeClass: string; code?: string }[];
  explanations: string[];
  inconsistencies: string[];
  missingData: string[];
}

function computeSensitivity(statuts: BdcStatut[]): SensitivityResult {
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

  for (const s of statuts) {
    const group = s.regroupementType || "";
    const code = s.codeStatut || "";
    const type = s.cdTypeStatut || "";

    if (group === "Liste rouge") {
      hasRedList = true;
      const score = RED_LIST_SCORES[code] ?? 0;
      if (score > bestRedList) {
        bestRedList = score;
        bestRedListCode = code;
      }
    } else if (group === "Protection") {
      hasProtection = true;
      if (type === "PN") protectionScore = Math.max(protectionScore, 1.0);
      else if (type === "PR") protectionScore = Math.max(protectionScore, 0.8);
      else if (type === "PD") protectionScore = Math.max(protectionScore, 0.7);
      else if (type === "POM") protectionScore = Math.max(protectionScore, 0.9);
      else protectionScore = Math.max(protectionScore, 0.5);
    } else if (group === "Directives européennes") {
      hasDirective = true;
      directiveScore = Math.max(directiveScore, 0.8);
    } else if (group === "Conventions internationales") {
      hasConvention = true;
      conventionScore = Math.max(conventionScore, 0.7);
    } else if (group === "ZNIEFF") {
      hasZnieff = true;
      znieffScore = 0.6;
    } else if (group === "Plan national") {
      hasPna = true;
      if (type === "PNA") pnaScore = Math.max(pnaScore, 0.8);
      else if (type === "exPNA") pnaScore = Math.max(pnaScore, 0.4);
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

  if (bestRedListCode && bestRedList >= 0.6) {
    const codeLabel: Record<string, string> = { CR: "En danger critique", EN: "En danger", VU: "Vulnerable" };
    drivers.push({ label: codeLabel[bestRedListCode] || bestRedListCode, badgeClass: LR_CODE_COLORS[bestRedListCode] || "bg-gray-200 text-gray-700", code: bestRedListCode });
    explanations.push(`Statut Liste rouge ${bestRedListCode} : augmente la sensibilite ecologique`);
  } else if (bestRedListCode && bestRedList >= 0.3) {
    explanations.push(`Statut Liste rouge ${bestRedListCode} : sensibilite ecologique moderee`);
  }

  if (hasProtection) {
    drivers.push({ label: "Protege", badgeClass: "bg-blue-100 text-blue-800" });
    const level = protectionScore >= 1.0 ? "nationale" : protectionScore >= 0.8 ? "regionale" : "departementale";
    explanations.push(`Protection ${level} : augmente la sensibilite reglementaire`);
  }

  if (hasDirective) {
    drivers.push({ label: "Directive UE", badgeClass: "bg-indigo-100 text-indigo-800" });
    explanations.push("Directive europeenne Habitat/Oiseaux : augmente la sensibilite reglementaire");
  }

  if (hasConvention) {
    explanations.push("Convention internationale : renforce le cadre reglementaire");
  }

  if (hasZnieff) {
    drivers.push({ label: "ZNIEFF", badgeClass: "bg-emerald-100 text-emerald-800" });
    explanations.push("Determinante ZNIEFF : augmente la sensibilite territoriale");
  }

  if (hasPna) {
    drivers.push({ label: "PNA", badgeClass: "bg-teal-100 text-teal-800" });
    explanations.push("Plan national d'actions : augmente la sensibilite territoriale");
  }

  if (invasiveScore > 0) {
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

function ScoreRing({ score, ringColor, size = 80 }: { score: number; ringColor: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className={ringColor} strokeWidth={6} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}

function DimensionBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: "width 0.5s ease" }} />
      </div>
      <span className="w-8 text-right text-xs font-mono text-muted-foreground">{value.toFixed(1)}</span>
    </div>
  );
}

function SensitivityScorePanel({ statuts }: { statuts: BdcStatut[] }) {
  const [expanded, setExpanded] = useState(false);
  const result = useMemo(() => computeSensitivity(statuts), [statuts]);

  if (result.score === 0 && result.missingData.length > 1) return null;

  const summaryParts: string[] = [];
  if (result.ecological >= 0.6) summaryParts.push("statut menace");
  if (result.regulatory >= 0.7) summaryParts.push("protection reglementaire");
  if (result.territorial >= 0.5) summaryParts.push("enjeu territorial");
  if (result.management >= 0.5) summaryParts.push("pression de gestion");
  const summary = summaryParts.length > 0
    ? `${result.label} en raison de : ${summaryParts.join(", ")}.`
    : result.missingData.length > 0
      ? `Donnees insuffisantes pour une evaluation complete.`
      : `Aucune sensibilite particuliere identifiee.`;

  return (
    <div className={`p-6 rounded-2xl border shadow-sm ${result.bgColor} ${result.borderColor}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
        <Activity className="w-4 h-4 text-primary" />
        Score de sensibilite
      </div>

      <div className="flex items-center gap-6">
        <div className="relative shrink-0">
          <ScoreRing score={result.score} ringColor={result.ringColor} />
          <div className="absolute inset-0 flex items-center justify-center rotate-0">
            <span className={`text-2xl font-bold ${result.color}`}>{result.score}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className={`text-lg font-semibold ${result.color}`}>{result.label}</div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{summary}</p>

          {result.drivers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {result.drivers.map((d, i) => (
                <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-semibold ${d.badgeClass}`}>
                  {d.code ? `${d.code} ` : ""}{d.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {result.inconsistencies.length > 0 && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-100/60 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{result.inconsistencies.map((t, i) => <p key={i}>{t}</p>)}</div>
        </div>
      )}

      {result.missingData.length > 0 && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border text-muted-foreground text-xs">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{result.missingData.join(" · ")}</span>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-4 flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "Masquer le detail" : "Pourquoi ce score ?"}
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border/50 space-y-5">
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dimensions</h4>
            <DimensionBar label="Ecologique" value={result.ecological} color="bg-red-400" />
            <DimensionBar label="Reglementaire" value={result.regulatory} color="bg-blue-400" />
            <DimensionBar label="Territorial" value={result.territorial} color="bg-emerald-400" />
            <DimensionBar label="Gestion" value={result.management} color="bg-orange-400" />
          </div>

          {result.explanations.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contributions</h4>
              <ul className="space-y-1.5">
                {result.explanations.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                    <span className="text-primary mt-0.5">·</span>
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground/60 pt-2 border-t border-border/30">
            Score = 0.4 × ecologique + 0.3 × reglementaire + 0.2 × territorial + 0.1 × gestion
          </div>
        </div>
      )}
    </div>
  );
}

function sanitizeCitation(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  const allowed = new Set(["EM", "I", "B", "STRONG", "BR"]);
  const walk = (node: Node) => {
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      const child = node.childNodes[i];
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (!allowed.has(el.tagName)) {
          while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el);
          el.remove();
        } else {
          while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
          walk(el);
        }
      }
    }
  };
  walk(div);
  return div.innerHTML;
}

function StatutsSection({ statuts }: { statuts: BdcStatut[] }) {
  const grouped = new Map<string, BdcStatut[]>();

  for (const s of statuts) {
    const key = s.regroupementType || "Autre";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }

  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    const ia = REGROUPEMENT_ORDER.indexOf(a[0]);
    const ib = REGROUPEMENT_ORDER.indexOf(b[0]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <CollapsibleSection
      icon={<ScrollText className="w-4 h-4 text-primary" />}
      title="Statuts BDC"
      count={statuts.length}
      defaultOpen={false}
    >
      <div className="space-y-4">
        {sortedGroups.map(([group, items]) => (
          <div key={group} className={`rounded-xl border p-4 ${REGROUPEMENT_COLORS[group] || "border-border bg-muted/30"}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${REGROUPEMENT_BADGE[group] || "bg-muted text-muted-foreground"}`}>
                {group}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((s, i) => (
                <div key={`${s.cdTypeStatut}-${i}`} className="flex items-start gap-2 text-sm">
                  {s.codeStatut && group === "Liste rouge" ? (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5 ${LR_CODE_COLORS[s.codeStatut] || "bg-gray-200 text-gray-700"}`}>
                      {s.codeStatut}
                    </span>
                  ) : s.codeStatut ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-foreground/10 text-foreground/70 shrink-0 mt-0.5">
                      {s.codeStatut}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground/90">
                        <span className="font-medium">{s.lbTypeStatut}</span>
                        {s.labelStatut && s.labelStatut !== "true" && <> — {s.labelStatut}</>}
                      </span>
                      {s.lbAdmTr && (
                        <span className="text-muted-foreground text-xs">({s.lbAdmTr})</span>
                      )}
                      {s.docUrl && /^https?:\/\//i.test(s.docUrl) && (
                        <a
                          href={s.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Consulter le texte de référence"
                          className="inline-flex items-center text-primary hover:text-primary/80 transition-colors shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {s.fullCitation && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeCitation(s.fullCitation) }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
