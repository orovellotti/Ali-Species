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
  getGetTaxonStatutsQueryKey,
  getRandomTaxon
} from "@workspace/api-client-react";
import type { BdcStatut } from "@workspace/api-client-react";
import { useParams, Link, useLocation } from "wouter";
import { formatRank, formatHabitat, formatStatus, taxonUrl, parseCdNomFromParam } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, ChevronDown, Image as ImageIcon, MapPin, Tag, Globe, FileText, Layers, Link2, BookOpen, BarChart3, ExternalLink, Shield, ScrollText, Activity, AlertTriangle, Info, Users, X, ZoomIn, Shuffle } from "lucide-react";
import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { Badge } from "@/components/ui/badge";

function proxyImg(url: string | undefined | null): string {
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return url;
  return `${import.meta.env.BASE_URL}api/image-proxy?url=${encodeURIComponent(url)}`;
}

function GbifMiniMap({ gbifKey }: { gbifKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 512;
    const h = 256;
    canvas.width = w;
    canvas.height = h;

    let cancelled = false;
    const tiles = [
      [1, 0, 0], [1, 1, 0],
      [1, 0, 1], [1, 1, 1],
    ] as const;

    const baseTiles = tiles.map(([z, x, y]) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
      return { img, x, y };
    });

    const overlayTiles = tiles.map(([z, x, y]) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `https://api.gbif.org/v2/map/occurrence/density/${z}/${x}/${y}@2x.png?taxonKey=${gbifKey}&bin=hex&hexPerTile=20&style=green.poly`;
      return { img, x, y };
    });

    let loadedCount = 0;
    const totalExpected = baseTiles.length;

    function draw() {
      if (cancelled) return;
      ctx!.clearRect(0, 0, w, h);
      for (const t of baseTiles) {
        const dx = t.x * (w / 2);
        const dy = t.y * (h / 2);
        try { ctx!.drawImage(t.img, dx, dy, w / 2, h / 2); } catch {}
      }
      for (const t of overlayTiles) {
        const dx = t.x * (w / 2);
        const dy = t.y * (h / 2);
        try { ctx!.drawImage(t.img, dx, dy, w / 2, h / 2); } catch {}
      }
    }

    for (const t of baseTiles) {
      t.img.onload = () => {
        loadedCount++;
        if (loadedCount >= totalExpected) {
          draw();
          setLoaded(true);
        }
      };
    }
    for (const t of overlayTiles) {
      t.img.onload = () => draw();
      t.img.onerror = () => {};
    }

    return () => { cancelled = true; };
  }, [gbifKey]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-auto rounded-t-2xl transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      style={{ aspectRatio: "2/1", background: "#e8ecf1" }}
    />
  );
}

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
  const cdNom = parseCdNomFromParam(params.slug || "0");

  const { data: taxon, isLoading: taxonLoading } = useGetTaxon(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonQueryKey(cdNom) } });
  const { data: classification, isLoading: classLoading } = useGetTaxonClassification(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonClassificationQueryKey(cdNom) } });
  const { data: media, isLoading: mediaLoading } = useGetTaxonMedia(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonMediaQueryKey(cdNom) } });
  const { data: children, isLoading: childrenLoading } = useGetTaxonChildren(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonChildrenQueryKey(cdNom) } });
  const { data: wikipedia, isLoading: wikiLoading } = useGetTaxonWikipedia(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonWikipediaQueryKey(cdNom) } });
  const { data: gbif, isLoading: gbifLoading } = useGetTaxonGbif(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonGbifQueryKey(cdNom) } });
  const { data: statuts, isLoading: statutsLoading } = useGetTaxonStatuts(cdNom, { query: { enabled: !!cdNom, queryKey: getGetTaxonStatutsQueryKey(cdNom) } });

  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const [, navigate] = useLocation();

  const handleRandom = useCallback(async () => {
    setRandomLoading(true);
    try {
      const t = await getRandomTaxon();
      if (t?.cdNom && t?.lbNom) {
        navigate(taxonUrl(t.cdNom, t.lbNom));
      }
    } finally {
      setRandomLoading(false);
    }
  }, [navigate]);

  const sensitivity = useMemo(() => {
    if (!statuts || statuts.length === 0) return null;
    return computeSensitivity(statuts);
  }, [statuts]);

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

  const pageTitle = `${taxon.lbNom}${taxon.nomVern ? ` (${taxon.nomVern.split(",")[0].trim()})` : ""} – ALI Species`;
  const pageDescription = `${taxon.lbNom}${taxon.lbAuteur ? ` ${taxon.lbAuteur}` : ""}${taxon.nomVern ? ` — ${taxon.nomVern}` : ""}. ${formatRank(taxon.rang)} du referentiel taxonomique TAXREF v18. Classification, statuts de conservation, donnees GBIF et images.`;
  const firstImage = media?.images?.[0]?.url;
  const canonicalUrl = `${window.location.origin}${import.meta.env.BASE_URL}${taxonUrl(taxon.cdNom, taxon.lbNom).slice(1)}`;

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

  const iucnClass = (cat?: string | null) => {
    if (!cat) return "bg-green-100 text-green-800 border-green-200";
    if (cat === "CR" || cat === "CRITICALLY_ENDANGERED") return "bg-red-100 text-red-800 border-red-200";
    if (cat === "EN" || cat === "ENDANGERED") return "bg-orange-100 text-orange-800 border-orange-200";
    if (cat === "VU" || cat === "VULNERABLE") return "bg-yellow-100 text-yellow-800 border-yellow-200";
    if (cat === "NT" || cat === "NEAR_THREATENED") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-green-100 text-green-800 border-green-200";
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

      {lightboxImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxImg(null)}
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImg}
            alt={taxon.lbNom}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}

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
                      href={taxonUrl(node.cdNom, node.lbNom)}
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

      <div className="container mx-auto px-4 py-10 max-w-6xl">
        <div className="grid lg:grid-cols-[1fr_380px] gap-10 items-start">
          
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="secondary" className="font-mono text-xs tracking-wider uppercase bg-primary/10 text-primary hover:bg-primary/20">
                  {formatRank(taxon.rang)}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground/60">CD_NOM {taxon.cdNom}</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-1 italic" data-testid="text-taxon-name" lang="la">
                {taxon.lbNom}
              </h1>
              
              {taxon.lbAuteur && (
                <p className="text-base text-muted-foreground/70 font-serif mb-1">
                  {taxon.lbAuteur}
                </p>
              )}

              {taxon.nomVern && (
                <p className="text-lg text-foreground/80 font-medium">{taxon.nomVern.split(",")[0].trim()}</p>
              )}
            </div>

            {sensitivity && sensitivity.score > 0 && (
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${sensitivity.bgColor} ${sensitivity.borderColor}`}>
                <div className="relative shrink-0 w-14 h-14">
                  <ScoreRing score={sensitivity.score} ringColor={sensitivity.ringColor} size={56} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-lg font-bold ${sensitivity.color}`}>{sensitivity.score}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${sensitivity.color}`}>{sensitivity.label}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {sensitivity.drivers.slice(0, 4).map((d, i) => (
                      <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${d.badgeClass}`}>
                        {d.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {gbif?.iucnCategoryLabel && (
                <span className={`px-3 py-1.5 rounded-lg font-semibold text-sm flex items-center gap-1.5 border ${iucnClass(gbif.iucnCategory)}`}>
                  <Shield className="w-3.5 h-3.5" />UICN : {gbif.iucnCategory}
                </span>
              )}
              {taxon.habitat && (
                <span className="px-3 py-1.5 bg-muted/80 text-foreground/70 rounded-lg text-sm font-medium flex items-center gap-1.5 border border-border">
                  <MapPin className="w-3.5 h-3.5 text-primary" />{formatHabitat(taxon.habitat)}
                </span>
              )}
              {taxon.fr && (
                <span className="px-3 py-1.5 bg-muted/80 text-foreground/70 rounded-lg text-sm font-medium flex items-center gap-1.5 border border-border">
                  <Globe className="w-3.5 h-3.5 text-primary" />{formatStatus(taxon.fr)}
                </span>
              )}
              {gbif?.occurrenceCount != null && (
                <span className="px-3 py-1.5 bg-muted/80 text-foreground/70 rounded-lg text-sm font-medium flex items-center gap-1.5 border border-border">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" />{gbif.occurrenceCount.toLocaleString("fr-FR")} observations
                </span>
              )}
              {taxon.group1Inpn && (
                <span className="px-3 py-1.5 bg-primary/8 text-primary rounded-lg text-sm font-medium border border-primary/15">{taxon.group1Inpn}</span>
              )}
              {taxon.group2Inpn && taxon.group2Inpn !== taxon.group1Inpn && (
                <span className="px-3 py-1.5 bg-primary/8 text-primary rounded-lg text-sm font-medium border border-primary/15">{taxon.group2Inpn}</span>
              )}
            </div>

            {taxon.nomValide && taxon.nomValide !== taxon.nomComplet && taxon.cdRef !== taxon.cdNom && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Link2 className="w-4 h-4 text-amber-600" />
                  <span className="font-medium text-amber-800 dark:text-amber-400">Synonyme</span>
                </div>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Nom valide de reference :{" "}
                  <Link href={taxonUrl(taxon.cdRef, taxon.nomValide)} className="italic underline underline-offset-4 hover:text-amber-900">
                    {taxon.nomValide}
                  </Link>
                </p>
              </div>
            )}

            {wikiLoading ? (
              <Skeleton className="h-20 w-full rounded-2xl" />
            ) : wikipedia?.extract ? (
              <div>
                <p className="text-muted-foreground leading-relaxed text-[15px]">{wikipedia.extract}</p>
                {wikipedia.url && (
                  <a
                    href={wikipedia.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-sm text-primary hover:underline underline-offset-4"
                  >
                    Lire sur Wikipedia
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
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
                        gbif.iucnCategory === "CR" || gbif.iucnCategory === "CRITICALLY_ENDANGERED" ? "bg-red-100" :
                        gbif.iucnCategory === "EN" || gbif.iucnCategory === "ENDANGERED" ? "bg-orange-100" :
                        gbif.iucnCategory === "VU" || gbif.iucnCategory === "VULNERABLE" ? "bg-yellow-100" :
                        gbif.iucnCategory === "NT" || gbif.iucnCategory === "NEAR_THREATENED" ? "bg-amber-100" :
                        "bg-green-100"
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
                      href={taxonUrl(child.cdNom, child.lbNom)}
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
            ) : null}
          </div>

          <div className="space-y-4 lg:sticky lg:top-20">
            {mediaLoading ? (
              <Skeleton className="w-full aspect-[4/3] rounded-2xl" />
            ) : hasImages ? (
              <div className="space-y-3">
                {media.images.map((img, i) => (
                  <div
                    key={i}
                    className="group relative rounded-2xl overflow-hidden bg-muted border border-border shadow-sm cursor-zoom-in"
                    onClick={() => setLightboxImg(proxyImg(img.url))}
                  >
                    <img 
                      src={proxyImg(img.url)} 
                      alt={img.title || taxon.lbNom} 
                      className="w-full h-auto object-cover object-center max-h-[500px]"
                      loading={i === 0 ? "eager" : "lazy"}
                      data-testid={`img-taxon-${i}`}
                    />
                    <div className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ZoomIn className="w-4 h-4" />
                    </div>
                    {(img.title || img.author) && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
                        {img.title && <p className="text-white text-xs font-medium line-clamp-1">{img.title}</p>}
                        {img.author && <p className="text-white/70 text-[10px] mt-0.5">{img.author}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="aspect-[4/3] rounded-2xl bg-muted border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                <ImageIcon className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">Aucune image disponible</p>
              </div>
            )}

            {gbif?.gbifKey && (
              <div className="rounded-2xl overflow-hidden border border-border shadow-sm">
                <a
                  href={`https://www.gbif.org/occurrence/search?taxon_key=${gbif.gbifKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block relative group"
                >
                  <GbifMiniMap gbifKey={gbif.gbifKey} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-t-2xl" />
                </a>
                <div className="px-3 py-2 bg-card flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Occurrences GBIF</span>
                  <a
                    href={`https://www.gbif.org/occurrence/search?taxon_key=${gbif.gbifKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline underline-offset-2 flex items-center gap-1"
                  >
                    Explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {taxon.url && (
                <a 
                  href={taxon.url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex-1 py-3 px-4 bg-card hover:bg-muted text-center border border-border rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                  data-testid="link-inpn"
                >
                  INPN
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {gbif?.gbifUrl && (
                <a 
                  href={gbif.gbifUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex-1 py-3 px-4 bg-card hover:bg-muted text-center border border-border rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  GBIF
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <button
              onClick={handleRandom}
              disabled={randomLoading}
              className="w-full py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-center rounded-xl text-sm font-semibold transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
            >
              <Shuffle className={`w-4 h-4 ${randomLoading ? "animate-spin" : ""}`} />
              {randomLoading ? "Chargement..." : "Espece au hasard"}
            </button>
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
  const [scoreExpanded, setScoreExpanded] = useState(false);
  const sensitivity = useMemo(() => computeSensitivity(statuts), [statuts]);

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

  const showScore = sensitivity.score > 0 || sensitivity.missingData.length <= 1;

  const summaryParts: string[] = [];
  if (sensitivity.ecological >= 0.6) summaryParts.push("statut menace");
  if (sensitivity.regulatory >= 0.7) summaryParts.push("protection reglementaire");
  if (sensitivity.territorial >= 0.5) summaryParts.push("enjeu territorial");
  if (sensitivity.management >= 0.5) summaryParts.push("pression de gestion");
  const scoreSummary = summaryParts.length > 0
    ? `${sensitivity.label} en raison de : ${summaryParts.join(", ")}.`
    : sensitivity.missingData.length > 0
      ? `Donnees insuffisantes pour une evaluation complete.`
      : `Aucune sensibilite particuliere identifiee.`;

  return (
    <CollapsibleSection
      icon={<ScrollText className="w-4 h-4 text-primary" />}
      title="Statuts"
      count={statuts.length}
      defaultOpen={false}
    >
      <div className="space-y-4">
        {showScore && (
          <div className={`p-5 rounded-xl border ${sensitivity.bgColor} ${sensitivity.borderColor}`}>
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <ScoreRing score={sensitivity.score} ringColor={sensitivity.ringColor} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-2xl font-bold ${sensitivity.color}`}>{sensitivity.score}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  <Activity className="w-3.5 h-3.5" />
                  Synthese des statuts
                </div>
                <div className={`text-lg font-semibold ${sensitivity.color}`}>{sensitivity.label}</div>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{scoreSummary}</p>
                {sensitivity.drivers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {sensitivity.drivers.map((d, i) => (
                      <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-semibold ${d.badgeClass}`}>
                        {d.code ? `${d.code} ` : ""}{d.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {sensitivity.inconsistencies.length > 0 && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-100/60 border border-amber-200 text-amber-800 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{sensitivity.inconsistencies.map((t, i) => <p key={i}>{t}</p>)}</div>
              </div>
            )}

            {sensitivity.missingData.length > 0 && (
              <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-muted/50 border border-border text-muted-foreground text-xs">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{sensitivity.missingData.join(" · ")}</span>
              </div>
            )}

            <button
              onClick={() => setScoreExpanded(!scoreExpanded)}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${scoreExpanded ? "rotate-180" : ""}`} />
              {scoreExpanded ? "Masquer le detail" : "Detail du score"}
            </button>

            {scoreExpanded && (
              <div className="mt-3 pt-3 border-t border-border/50 space-y-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dimensions</h4>
                  <DimensionBar label="Ecologique" value={sensitivity.ecological} color="bg-red-400" />
                  <DimensionBar label="Reglementaire" value={sensitivity.regulatory} color="bg-blue-400" />
                  <DimensionBar label="Territorial" value={sensitivity.territorial} color="bg-emerald-400" />
                  <DimensionBar label="Gestion" value={sensitivity.management} color="bg-orange-400" />
                </div>
                {sensitivity.explanations.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contributions</h4>
                    <ul className="space-y-1.5">
                      {sensitivity.explanations.map((e, i) => (
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
        )}

        {sortedGroups.length > 0 && sortedGroups.map(([group, items]) => (
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

        {(sensitivity.missingData.length > 0 || statuts.length === 0) && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary" />
                Donnees de statut incompletes ?
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Vous constatez des informations manquantes ou inexactes sur ce taxon ? Signalez-le a Natural Solutions.
              </p>
            </div>
            <a
              href="https://www.natural-solutions.eu/contact"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-full transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            >
              Nous contacter
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
