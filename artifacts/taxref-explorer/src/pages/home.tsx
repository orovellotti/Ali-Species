import { useState, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { ConversationalBar } from "@/components/ConversationalBar";
import { useGetTaxonStats, getRandomTaxon } from "@workspace/api-client-react";
import { Trees, Microscope, BookOpen, ScrollText, Shuffle, Layers } from "lucide-react";
import aliLogo from "@/assets/images/ali-logo.png";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { Trans, useTranslation } from "react-i18next";
import { taxonUrl } from "@/lib/constants";
import { localeNumber } from "@/i18n";
import animaliaImg from "@/assets/images/animalia.png";
import plantaeImg from "@/assets/images/plantae.png";
import fungiImg from "@/assets/images/fungi.png";


export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetTaxonStats();
  const [, navigate] = useLocation();
  const [randomLoading, setRandomLoading] = useState(false);
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || "fr";

  const handleRandom = useCallback(async () => {
    setRandomLoading(true);
    try {
      const taxon = await getRandomTaxon();
      if (taxon?.cdNom && taxon?.lbNom) {
        navigate(taxonUrl(taxon.cdNom, taxon.lbNom));
      }
    } finally {
      setRandomLoading(false);
    }
  }, [navigate]);

  return (
    <Layout>
      <Helmet>
        <html lang={lang} />
        <title>{t("home.title")}</title>
        <meta name="description" content={t("home.metaDescription")} />
        <meta property="og:title" content={t("home.ogTitle")} />
        <meta property="og:description" content={t("home.ogDescription")} />
        <meta property="og:type" content="website" />
      </Helmet>
      <section className="relative pt-24 pb-32 px-4 overflow-visible">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <div className="inline-flex items-center justify-center p-2 bg-primary/10 rounded-2xl mb-6 ring-1 ring-primary/20">
            <img src={aliLogo} alt="ALI Species" className="w-8 h-8" />
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-foreground mb-6 leading-tight">
            {t("home.heroTitlePre")}
            <span className="text-primary italic">{t("home.heroTitleHighlight")}</span>
            {t("home.heroTitlePost")}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-4 max-w-2xl mx-auto leading-relaxed">
            <Trans i18nKey="home.heroSubtitle" components={{ s: <span className="text-foreground font-medium" /> }} />
          </p>
          <p className="text-sm text-muted-foreground/80 mb-12 max-w-2xl mx-auto">
            {t("home.heroNote")}
          </p>

          <ConversationalBar />

          <button
            onClick={handleRandom}
            disabled={randomLoading}
            className="mt-6 inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-full transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
          >
            <Shuffle className={`w-4 h-4 ${randomLoading ? "animate-spin" : ""}`} />
            {randomLoading ? t("home.randomLoading") : t("home.randomCta")}
          </button>
        </div>
      </section>

      <section className="py-16 bg-card border-y border-border">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-serif font-semibold">{t("home.statsTitle")}</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              <Trans i18nKey="home.statsSubtitle" components={{ s: <span className="font-medium" /> }} />
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {statsLoading || !stats ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="bg-background rounded-2xl p-6 text-center border border-border/50">
                  <Skeleton className="w-16 h-10 mx-auto mb-2" />
                  <Skeleton className="w-24 h-4 mx-auto" />
                </div>
              ))
            ) : (
              <>
                <StatCard icon={<Microscope className="w-4 h-4" />} value={localeNumber(stats.totalTaxons, lang)} label={t("home.statCardRecords")} />
                <StatCard icon={<Trees className="w-4 h-4" />} value={localeNumber(stats.totalSpecies, lang)} label={t("home.statCardSpecies")} />
                <StatCard icon={<Layers className="w-4 h-4" />} value={localeNumber(stats.totalGenera, lang)} label={t("home.statCardGenera")} />
                <StatCard icon={<BookOpen className="w-4 h-4" />} value={localeNumber(stats.totalFamilies, lang)} label={t("home.statCardFamilies")} />
                <StatCard icon={<ScrollText className="w-4 h-4" />} value={localeNumber(stats.totalStatuts, lang)} label={t("home.statCardStatuses")} />
              </>
            )}
          </div>
          
          {!statsLoading && stats && stats.kingdomCounts && (
            <div className="mt-12 flex flex-wrap justify-center gap-3">
              {stats.kingdomCounts.map(k => (
                <div key={k.regne} className="px-4 py-2 bg-background border border-border/50 rounded-full text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <span className="text-foreground">{k.regne}</span>
                  <span className="bg-muted px-2 py-0.5 rounded-full text-xs">{localeNumber(k.count, lang)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-24 px-4 container mx-auto max-w-5xl">
        <h2 className="text-3xl font-serif font-semibold mb-3 text-center">{t("home.kingdomsTitle")}</h2>
        <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">{t("home.kingdomsSubtitle")}</p>
        <div className="grid md:grid-cols-3 gap-8">
          <FeaturedCard 
            title="Animalia" 
            subtitle={t("home.cardAnimaliaSubtitle")}
            desc={t("home.cardAnimaliaDesc")}
            fallbackImage={animaliaImg}
            cdNom={183716}
          />
          <FeaturedCard 
            title="Plantae" 
            subtitle={t("home.cardPlantaeSubtitle")}
            desc={t("home.cardPlantaeDesc")}
            fallbackImage={plantaeImg}
            cdNom={187079}
          />
          <FeaturedCard 
            title="Fungi" 
            subtitle={t("home.cardFungiSubtitle")}
            desc={t("home.cardFungiDesc")}
            fallbackImage={fungiImg}
            cdNom={187496}
          />
        </div>
      </section>
    </Layout>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode, value: string, label: string }) {
  return (
    <div className="bg-background rounded-2xl p-6 text-center border border-border/50 shadow-sm hover:shadow-md transition-shadow group">
      <div className="mx-auto w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="text-2xl lg:text-3xl font-bold text-foreground mb-1 font-serif tracking-tight">{value}</div>
      <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function FeaturedCard({ title, subtitle, desc, fallbackImage, cdNom }: { title: string, subtitle: string, desc: string, fallbackImage: string, cdNom: number }) {
  return (
    <Link href={taxonUrl(cdNom, title)} className="group block">
      <div className="relative h-64 rounded-2xl overflow-hidden mb-4 bg-muted">
        <img 
          src={fallbackImage} 
          alt={title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <h3 className="text-2xl font-serif font-bold text-white italic">{title}</h3>
          <p className="text-sm text-white/90 font-medium">{subtitle}</p>
        </div>
      </div>
      <p className="text-muted-foreground group-hover:text-foreground transition-colors">{desc}</p>
    </Link>
  );
}
