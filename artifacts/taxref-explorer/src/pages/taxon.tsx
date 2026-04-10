import { Layout } from "@/components/Layout";
import { 
  useGetTaxon, 
  useGetTaxonClassification, 
  useGetTaxonMedia, 
  useGetTaxonChildren,
  getGetTaxonQueryKey,
  getGetTaxonClassificationQueryKey,
  getGetTaxonMediaQueryKey,
  getGetTaxonChildrenQueryKey
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { formatRank, formatHabitat, formatStatus } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Image as ImageIcon, MapPin, Tag, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TaxonDetail() {
  const params = useParams();
  const cdNom = parseInt(params.cdNom || "0", 10);

  const { data: taxon, isLoading: taxonLoading } = useGetTaxon(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonQueryKey(cdNom) } });
  const { data: classification, isLoading: classLoading } = useGetTaxonClassification(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonClassificationQueryKey(cdNom) } });
  const { data: media, isLoading: mediaLoading } = useGetTaxonMedia(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonMediaQueryKey(cdNom) } });
  const { data: children, isLoading: childrenLoading } = useGetTaxonChildren(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonChildrenQueryKey(cdNom) } });

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
        <div className="container mx-auto px-4 py-3 max-w-6xl overflow-x-auto whitespace-nowrap scrollbar-hide">
          <div className="flex items-center text-sm">
            {classLoading ? (
              <Skeleton className="h-5 w-48" />
            ) : classification && classification.length > 0 ? (
              classification.map((node, i) => (
                <div key={node.cdNom} className="flex items-center">
                  <Link 
                    href={`/taxon/${node.cdNom}`}
                    className="hover:text-primary hover:underline underline-offset-4 text-muted-foreground transition-colors flex items-center gap-1.5"
                  >
                    <span className="text-[10px] font-medium bg-border/50 text-foreground px-1 rounded uppercase">{node.rang}</span>
                    {node.lbNom}
                  </Link>
                  {i < classification.length - 1 && (
                    <ChevronRight className="w-4 h-4 mx-2 text-muted-foreground/50 shrink-0" />
                  )}
                </div>
              ))
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
            </div>

            {(taxon.nomVern || taxon.nomVernEng || taxon.habitat || taxon.fr) && (
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
                </div>
              </div>
            )}

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
