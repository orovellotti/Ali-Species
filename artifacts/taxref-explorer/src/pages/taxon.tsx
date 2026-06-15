import { Layout } from "@/components/Layout";
import {
  useGetTaxonProfile,
  useGetTaxon,
  useGetTaxonClassification,
  useGetTaxonMedia,
  useGetTaxonChildren,
  useGetTaxonWikipedia,
  useGetTaxonGbif,
  useGetTaxonStatuts,
  useGetTaxonBhl,
  getGetTaxonProfileQueryKey,
  getGetTaxonQueryKey,
  getGetTaxonClassificationQueryKey,
  getGetTaxonMediaQueryKey,
  getGetTaxonChildrenQueryKey,
  getGetTaxonWikipediaQueryKey,
  getGetTaxonGbifQueryKey,
  getGetTaxonStatutsQueryKey,
  getGetTaxonBhlQueryKey,
  getRandomTaxon
} from "@workspace/api-client-react";
import type { BdcStatut, TaxonProfile, TaxonMedia, WikipediaInfo, GbifInfo, BlockError } from "@workspace/api-client-react";
import { useParams, Link, useLocation } from "wouter";
import { formatRank, formatHabitat, formatStatus, taxonUrl, parseCdNomFromParam } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, MapPin, Tag, Globe, FileText, Layers, Link2, BookOpen, BarChart3, ExternalLink, Shield, Users, X, Shuffle, Share2 } from "lucide-react";
import { ShareDiscoveryModal } from "@/components/ShareDiscoveryModal";
import type { ShareCardData } from "@/components/ShareDiscoveryCard";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { proxyImg } from "@/lib/proxyImg";
import { computeSensitivity } from "@/lib/sensitivity";
import { buildTaxonSeo } from "@/lib/taxonSeo";
import { ScoreRing } from "@/components/taxon/SensitivityWidgets";
import { CollapsibleSection } from "@/components/taxon/CollapsibleSection";
import { GbifMiniMap } from "@/components/taxon/GbifMiniMap";
import { StatutsSection } from "@/components/taxon/StatutsSection";
import { TraitsSection } from "@/components/taxon/TraitsSection";
import { InteractionsSection } from "@/components/taxon/InteractionsSection";
import { TaxonGallery } from "@/components/taxon/TaxonGallery";

export default function TaxonDetail() {
  const params = useParams();
  const cdNom = parseCdNomFromParam(params.slug || "0");

  // Unified profile endpoint — single round trip for taxon + classification + statuts + media + wikipedia + gbif.
  // Falls back below to per-block hooks if profile fails (e.g. server older than client).
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useGetTaxonProfile(cdNom, {
    query: { enabled: !!cdNom, queryKey: getGetTaxonProfileQueryKey(cdNom), retry: 1, throwOnError: false },
  });
  const profileFallback = !!cdNom && (profileError || (!profileLoading && !profile));

  const { data: taxonFb, isLoading: taxonFbLoading } = useGetTaxon(cdNom, {
    query: { enabled: profileFallback, queryKey: getGetTaxonQueryKey(cdNom) },
  });
  const { data: classFb, isLoading: classFbLoading } = useGetTaxonClassification(cdNom, {
    query: { enabled: profileFallback, queryKey: getGetTaxonClassificationQueryKey(cdNom) },
  });
  const { data: mediaFb, isLoading: mediaFbLoading } = useGetTaxonMedia(cdNom, {
    query: { enabled: profileFallback, queryKey: getGetTaxonMediaQueryKey(cdNom) },
  });
  const { data: wikiFb, isLoading: wikiFbLoading } = useGetTaxonWikipedia(cdNom, {
    query: { enabled: profileFallback, queryKey: getGetTaxonWikipediaQueryKey(cdNom) },
  });
  const { data: gbifFb, isLoading: gbifFbLoading } = useGetTaxonGbif(cdNom, {
    query: { enabled: profileFallback, queryKey: getGetTaxonGbifQueryKey(cdNom) },
  });
  const { data: statutsFb, isLoading: statutsFbLoading } = useGetTaxonStatuts(cdNom, {
    query: { enabled: profileFallback, queryKey: getGetTaxonStatutsQueryKey(cdNom) },
  });

  // Children are not in the profile (full list can be 100 items) — keep dedicated hook, always enabled.
  const { data: children, isLoading: childrenLoading } = useGetTaxonChildren(cdNom, {
    query: { enabled: !!cdNom, queryKey: getGetTaxonChildrenQueryKey(cdNom) },
  });
  // BHL stays lazy (heavy external call, may be unavailable).
  const { data: bhlData, error: bhlError, isLoading: bhlLoading } = useGetTaxonBhl(cdNom, {
    query: { enabled: !!cdNom, queryKey: getGetTaxonBhlQueryKey(cdNom), retry: false, throwOnError: false },
  });
  const bhl = bhlData ?? (bhlError && typeof bhlError === "object" && "data" in bhlError ? (bhlError as unknown as { data?: typeof bhlData }).data : undefined);

  const isBlockError = (b: unknown): b is BlockError =>
    !!b && typeof b === "object" && (b as { error?: unknown }).error === true;
  const safeBlock = <T,>(b: T | BlockError | undefined | null): T | undefined =>
    b == null || isBlockError(b) ? undefined : (b as T);

  const taxon = (profile?.taxon as TaxonProfile["taxon"] | undefined) ?? taxonFb;
  const taxonLoading = profileLoading && !profileFallback ? profileLoading : taxonFbLoading;
  const classification = (profile?.classification as TaxonProfile["classification"] | undefined) ?? classFb;
  const classLoading = profileLoading && !profileFallback ? profileLoading : classFbLoading;
  const media = (safeBlock<TaxonMedia>(profile?.media as TaxonMedia | BlockError | undefined)) ?? mediaFb;
  const mediaLoading = profileLoading && !profileFallback ? profileLoading : mediaFbLoading;
  const wikipedia = (safeBlock<WikipediaInfo>(profile?.wikipedia as WikipediaInfo | BlockError | undefined)) ?? wikiFb;
  const wikiLoading = profileLoading && !profileFallback ? profileLoading : wikiFbLoading;
  const gbif = (safeBlock<GbifInfo>(profile?.gbif as GbifInfo | BlockError | undefined)) ?? gbifFb;
  const gbifLoading = profileLoading && !profileFallback ? profileLoading : gbifFbLoading;
  const statuts = (profile?.statuts as BdcStatut[] | undefined) ?? statutsFb;
  const statutsLoading = profileLoading && !profileFallback ? profileLoading : statutsFbLoading;

  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation();

  // SEO: when a user (or crawler) lands on a cdNom-only URL or one with a
  // stale slug, silently rewrite the address bar to the canonical /taxon/:cdNom-:slug
  // form using history.replaceState (no reload, no extra request, no
  // duplicate-content signal for Google).
  useEffect(() => {
    if (!taxon?.cdNom || !taxon.lbNom) return;
    const canonical = taxonUrl(taxon.cdNom, taxon.lbNom);
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const desired = `${base}${canonical}`;
    if (typeof window !== "undefined" && window.location.pathname !== desired) {
      window.history.replaceState(null, "", desired + window.location.search + window.location.hash);
    }
  }, [taxon?.cdNom, taxon?.lbNom]);

  const handleRandom = useCallback(async () => {
    setRandomLoading(true);
    try {
      const random = await getRandomTaxon();
      if (random?.cdNom && random?.lbNom) {
        navigate(taxonUrl(random.cdNom, random.lbNom));
      }
    } finally {
      setRandomLoading(false);
    }
  }, [navigate]);

  const sensitivity = useMemo(() => {
    if (!statuts || statuts.length === 0) return null;
    return computeSensitivity(statuts);
  }, [statuts]);

  const shareData: ShareCardData | null = useMemo(() => {
    if (!taxon) return null;
    const firstImg = media?.images?.[0];
    let badge: ShareCardData["badge"] = null;
    let fact: string | null = null;
    if (sensitivity && sensitivity.score > 0 && sensitivity.drivers.length > 0) {
      const d = sensitivity.drivers[0];
      const tone: NonNullable<ShareCardData["badge"]>["tone"] =
        sensitivity.score >= 80 ? "danger" : sensitivity.score >= 50 ? "warning" : "info";
      badge = { label: d.label, tone };
    }
    const codes = new Set((statuts || []).map((s: BdcStatut) => s.codeStatut).filter(Boolean) as string[]);
    const types = new Set((statuts || []).map((s: BdcStatut) => s.cdTypeStatut).filter(Boolean) as string[]);
    if (codes.has("CR")) fact = t("share.factRedListCR");
    else if (codes.has("EN")) fact = t("share.factRedListEN");
    else if (codes.has("VU")) fact = t("share.factRedListVU");
    else if (types.has("PN") || types.has("PR") || types.has("PD")) fact = t("share.factProtected");
    else if (Array.from(types).some((tt) => tt.startsWith("DH") || tt.startsWith("DO"))) fact = t("share.factDirective");
    else fact = t("share.fallbackFact");
    const isEn = i18n.language?.toLowerCase().startsWith("en");
    const vernSource = isEn
      ? (taxon.nomVernEng || taxon.nomVern)
      : (taxon.nomVern || taxon.nomVernEng);
    return {
      cdNom: taxon.cdNom,
      scientificName: taxon.lbNom,
      author: taxon.lbAuteur,
      vernacular: vernSource ? vernSource.split(",")[0].trim() : null,
      rankLabel: formatRank(taxon.rang),
      imageUrl: firstImg ? proxyImg(firstImg.url) : null,
      imageCredit: firstImg?.author ?? null,
      classe: taxon.classe ?? null,
      famille: taxon.famille ?? null,
      fact,
      badge,
    };
  }, [taxon, media, sensitivity, statuts, t, i18n.language]);

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

  const { pageTitle, pageDescription, canonicalUrl, firstImage, jsonLd, breadcrumbJsonLd } =
    buildTaxonSeo({ taxon, classification, gbif, media });

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
        <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
        <link rel="canonical" href={canonicalUrl} />
        {/* Same URL serves both languages (client-side i18n), so both hreflangs point here. */}
        <link rel="alternate" hrefLang="fr" href={canonicalUrl} />
        <link rel="alternate" hrefLang="en" href={canonicalUrl} />
        <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="ALi Species" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:locale" content="fr_FR" />
        <meta property="og:locale:alternate" content="en_US" />
        {firstImage && <meta property="og:image" content={firstImage} />}
        {firstImage && <meta property="og:image:alt" content={taxon.lbNom} />}
        <meta name="twitter:card" content={firstImage ? "summary_large_image" : "summary"} />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        {firstImage && <meta name="twitter:image" content={firstImage} />}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        {breadcrumbJsonLd && (
          <script type="application/ld+json">{JSON.stringify(breadcrumbJsonLd)}</script>
        )}
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
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Badge variant="secondary" className="font-mono text-xs tracking-wider uppercase bg-primary/10 text-primary hover:bg-primary/20">
                  {formatRank(taxon.rang)}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground/60">CD_NOM {taxon.cdNom}</span>
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                  data-testid="button-share-discovery"
                  aria-label={t("share.button")}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("share.button")}</span>
                </button>
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
                    {sensitivity.drivers.slice(0, 6).map((d, i) => (
                      <span
                        key={i}
                        title={d.title || d.label}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${d.badgeClass}`}
                      >
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

            <TraitsSection cdNom={taxon.cdNom} />

            <InteractionsSection cdNom={taxon.cdNom} />

            {bhlLoading ? (
              <Skeleton className="h-16 w-full rounded-2xl" />
            ) : bhl?.unavailable && bhl?.message ? (
              <CollapsibleSection
                icon={<BookOpen className="w-4 h-4 text-muted-foreground" />}
                title="Bibliographie historique (BHL)"
                defaultOpen={false}
              >
                <p className="text-xs text-muted-foreground">{bhl.message}</p>
              </CollapsibleSection>
            ) : bhl?.references && bhl.references.length > 0 ? (
              <CollapsibleSection
                icon={<BookOpen className="w-4 h-4 text-primary" />}
                title="Bibliographie historique (BHL)"
                count={bhl.references.length}
                defaultOpen={false}
              >
                <p className="text-xs text-muted-foreground mb-3">
                  Publications numerisees mentionnant ce taxon, issues de la <a href="https://www.biodiversitylibrary.org/" target="_blank" rel="noreferrer" className="text-primary hover:underline">Biodiversity Heritage Library</a> (descriptions originales, flores et faunes anciennes).
                </p>
                <ul className="space-y-2">
                  {bhl.references.slice(0, 15).map((ref, i) => (
                    <li key={`${ref.itemId ?? ref.titleId ?? i}-${i}`} className="p-3 bg-muted/40 rounded-xl border border-border/50">
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-sm text-foreground hover:text-primary inline-flex items-start gap-1.5 group"
                        data-testid={`link-bhl-${ref.itemId ?? ref.titleId ?? i}`}
                      >
                        <span className="leading-snug">{ref.title}</span>
                        <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 opacity-60 group-hover:opacity-100" />
                      </a>
                      {(ref.authors || ref.date) && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {ref.authors}{ref.authors && ref.date ? " - " : ""}{ref.date}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {bhl.references.length > 15 && (
                  <div className="text-xs text-muted-foreground mt-2 italic">
                    +{bhl.references.length - 15} autres references disponibles via l'API BHL.
                  </div>
                )}
              </CollapsibleSection>
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
            ) : (
              <TaxonGallery
                images={media?.images}
                alt={taxon.lbNom}
                onZoom={(url) => setLightboxImg(url)}
              />
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

      {shareData && (
        <ShareDiscoveryModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          data={shareData}
          shareUrl={canonicalUrl}
        />
      )}
    </Layout>
  );
}
