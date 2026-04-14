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
import { ChevronRight, Image as ImageIcon, MapPin, Tag, Globe, FileText, Layers, Link2, BookOpen, BarChart3, ExternalLink, Shield, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

  return (
    <Layout>
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
          
          <div className="space-y-10">
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
              
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-2 italic" data-testid="text-taxon-name">
                {taxon.lbNom}
              </h1>
              
              {taxon.lbAuteur && (
                <p className="text-lg text-muted-foreground font-serif">
                  {taxon.lbAuteur}
                </p>
              )}

              {taxon.nomComplet && taxon.nomComplet !== taxon.lbNom && (
                <p className="text-sm text-muted-foreground mt-2">
                  <span className="font-medium text-foreground/60">Nom complet :</span>{" "}
                  <span className="italic">{taxon.nomComplet}</span>
                </p>
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

            {(taxon.group1Inpn || taxon.group2Inpn || taxon.group3Inpn) && (
              <div className="p-5 bg-card rounded-2xl border border-border shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
                  <Layers className="w-4 h-4 text-primary" />
                  Groupes INPN
                </div>
                <div className="flex flex-wrap gap-2">
                  {taxon.group1Inpn && (
                    <span className="px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                      {taxon.group1Inpn}
                    </span>
                  )}
                  {taxon.group2Inpn && (
                    <span className="px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                      {taxon.group2Inpn}
                    </span>
                  )}
                  {taxon.group3Inpn && (
                    <span className="px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-sm font-medium">
                      {taxon.group3Inpn}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-6 p-6 bg-card rounded-2xl border border-border shadow-sm">
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
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                      <MapPin className="w-4 h-4 text-primary" />
                      Habitat
                    </div>
                    <div className="text-muted-foreground">
                      {formatHabitat(taxon.habitat)}
                    </div>
                  </div>
                )}
                {taxon.fr && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                      <Globe className="w-4 h-4 text-primary" />
                      Statut en France
                    </div>
                    <div className="text-muted-foreground">
                      {formatStatus(taxon.fr)}
                    </div>
                  </div>
                )}

                {taxon.nomComplet && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                      <FileText className="w-4 h-4 text-primary" />
                      Nom complet
                    </div>
                    <div className="text-muted-foreground italic text-sm">
                      {taxon.nomComplet}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {wikiLoading ? (
              <Skeleton className="h-40 w-full rounded-2xl" />
            ) : wikipedia?.extract ? (
              <div className="p-6 bg-card rounded-2xl border border-border shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Description
                </div>
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
              </div>
            ) : null}

            {gbifLoading ? (
              <Skeleton className="h-32 w-full rounded-2xl" />
            ) : gbif?.gbifKey ? (
              <div className="p-6 bg-card rounded-2xl border border-border shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Donnees GBIF
                </div>
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
              </div>
            ) : null}

            {statutsLoading ? (
              <Skeleton className="h-40 w-full rounded-2xl" />
            ) : statuts && statuts.length > 0 ? (
              <StatutsSection statuts={statuts} />
            ) : null}

            <div>
              <h2 className="text-2xl font-serif font-semibold mb-6 flex items-center justify-between border-b border-border pb-2">
                <span>Taxons subordonne</span>
                {children && <span className="text-sm font-sans font-normal text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">{children.length} trouve{children.length > 1 ? "s" : ""}</span>}
              </h2>
              
              {childrenLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : children && children.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  {children.map(child => (
                    <Link 
                      key={child.cdNom} 
                      href={`/taxon/${child.cdNom}`}
                      className="flex items-center justify-between p-4 bg-background border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all group"
                      data-testid={`link-child-${child.cdNom}`}
                    >
                      <div className="truncate pr-4">
                        <div className="font-medium text-foreground truncate italic">{child.lbNom}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <span className="uppercase text-[10px] font-bold tracking-wider">{formatRank(child.rang)}</span>
                          {child.nomVern && <span className="truncate">- {child.nomVern}</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-muted/30 rounded-2xl border border-dashed border-border text-muted-foreground">
                  Aucun taxon subordonne.
                </div>
              )}
            </div>
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
    <div className="p-6 bg-card rounded-2xl border border-border shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-5 uppercase tracking-wider">
        <ScrollText className="w-4 h-4 text-primary" />
        Statuts BDC
        <span className="text-xs font-normal normal-case text-muted-foreground ml-1">({statuts.length})</span>
      </div>

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
    </div>
  );
}
