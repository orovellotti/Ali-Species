import { useState, useCallback, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { SearchAutocomplete } from "@/components/SearchAutocomplete";
import { useGetTaxonStats, getRandomTaxon } from "@workspace/api-client-react";
import { Trees, Microscope, BookOpen, ScrollText, Shuffle, Layers, ShieldAlert, X } from "lucide-react";
import aliLogo from "@/assets/images/ali-logo.png";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { taxonUrl } from "@/lib/constants";
import { TaxonomyTreemap } from "@/components/TaxonomyTreemap";
import animaliaImg from "@/assets/images/animalia.png";
import plantaeImg from "@/assets/images/plantae.png";
import fungiImg from "@/assets/images/fungi.png";


export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetTaxonStats();
  const [, navigate] = useLocation();
  const [randomLoading, setRandomLoading] = useState(false);
  const [treeData, setTreeData] = useState<any>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [statutType, setStatutType] = useState<string>("");
  const [statusTypes, setStatusTypes] = useState<{ code: string; label: string; taxa: number; group?: string }[]>([]);

  useEffect(() => {
    fetch("/api/status-types")
      .then((r) => r.json())
      .then(setStatusTypes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTreeLoading(true);
    const url = statutType
      ? `/api/taxons/taxonomy-tree?statutType=${encodeURIComponent(statutType)}`
      : "/api/taxons/taxonomy-tree";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setTreeData(data))
      .catch((err) => console.error("taxonomy-tree fetch error", err))
      .finally(() => setTreeLoading(false));
  }, [statutType]);

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
        <title>ALI Species — All Life Intelligence — Explorez le monde vivant de la France</title>
        <meta name="description" content="ALI Species — All Life Intelligence. Explorez le referentiel taxonomique national francais TAXREF v18. Recherchez parmi 300 000+ taxons par nom scientifique ou vernaculaire : classification, statuts de conservation, images et donnees GBIF." />
        <meta property="og:title" content="ALI Species — All Life Intelligence" />
        <meta property="og:description" content="Explorez le referentiel taxonomique national francais TAXREF v18. Recherchez parmi 300 000+ taxons par nom scientifique ou vernaculaire." />
        <meta property="og:type" content="website" />
      </Helmet>
      <section className="relative pt-24 pb-32 px-4 overflow-visible">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <div className="inline-flex items-center justify-center p-2 bg-primary/10 rounded-2xl mb-6 ring-1 ring-primary/20">
            <img src={aliLogo} alt="ALI Species" className="w-8 h-8" />
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-foreground mb-6 leading-tight">
            Explorez le monde vivant de la <span className="text-primary italic">France</span>.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Le referentiel taxonomique national couvrant la flore, la faune et les champignons. Base sur TAXREF v18, produit par PatriNat.
          </p>

          <SearchAutocomplete />

          <button
            onClick={handleRandom}
            disabled={randomLoading}
            className="mt-6 inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-full transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
          >
            <Shuffle className={`w-4 h-4 ${randomLoading ? "animate-spin" : ""}`} />
            {randomLoading ? "Chargement..." : "Espece au hasard"}
          </button>
        </div>

        <div className="container mx-auto max-w-5xl mt-16 relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 px-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
              <ShieldAlert className="w-4 h-4" />
              <span>Filtrer par statut :</span>
            </div>
            <div className="relative flex-1 w-full sm:w-auto sm:max-w-md">
              <select
                value={statutType}
                onChange={(e) => setStatutType(e.target.value)}
                className="w-full appearance-none bg-background border border-border rounded-full pl-4 pr-10 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                data-testid="select-status-type"
              >
                <option value="">Toutes les especes ({stats?.totalTaxons?.toLocaleString("fr-FR") || "..."})</option>
                {Object.entries(
                  statusTypes.reduce<Record<string, typeof statusTypes>>((acc, s) => {
                    const g = s.group || "Autres";
                    (acc[g] ||= []).push(s);
                    return acc;
                  }, {})
                ).map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map(s => (
                      <option key={s.code} value={s.code}>{s.label} ({s.taxa.toLocaleString("fr-FR")})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {statutType && (
                <button
                  type="button"
                  onClick={() => setStatutType("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Effacer le filtre"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {statutType && (
              <span className="text-xs text-muted-foreground italic">
                Espèces concernées par ce statut uniquement
              </span>
            )}
          </div>
          {treeData && !treeLoading ? <TaxonomyTreemap
            data={treeData}
            statutType={statutType}
            onNavigateToCdNom={(cdNom, lbNom) => navigate(taxonUrl(cdNom, lbNom))}
            onNavigateToTaxon={async (name, rang) => {
              try {
                const res = await fetch(`/api/taxons/search?q=${encodeURIComponent(name)}&limit=10`);
                const results = await res.json();
                const match = results.find((t: any) => t.rang === rang && t.lbNom === name) || results[0];
                if (match?.cdNom && match?.lbNom) {
                  navigate(taxonUrl(match.cdNom, match.lbNom));
                }
              } catch {}
            }} /> : (
            <div className="flex items-center justify-center h-[420px] border border-border rounded-xl bg-card">
              <div className="animate-pulse text-muted-foreground">Chargement de la taxonomie...</div>
            </div>
          )}
        </div>
      </section>

      <section className="py-16 bg-card border-y border-border">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-serif font-semibold">Le vivant en chiffres</h2>
            <p className="text-muted-foreground mt-2">Donnees du referentiel national</p>
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
                <StatCard icon={<Microscope className="w-4 h-4" />} value={stats.totalTaxons.toLocaleString("fr-FR")} label="Taxons" />
                <StatCard icon={<Trees className="w-4 h-4" />} value={stats.totalSpecies.toLocaleString("fr-FR")} label="Especes" />
                <StatCard icon={<Layers className="w-4 h-4" />} value={stats.totalGenera.toLocaleString("fr-FR")} label="Genres" />
                <StatCard icon={<BookOpen className="w-4 h-4" />} value={stats.totalFamilies.toLocaleString("fr-FR")} label="Familles" />
                <StatCard icon={<ScrollText className="w-4 h-4" />} value={stats.totalStatuts.toLocaleString("fr-FR")} label="Statuts BDC" />
              </>
            )}
          </div>
          
          {!statsLoading && stats && stats.kingdomCounts && (
            <div className="mt-12 flex flex-wrap justify-center gap-3">
              {stats.kingdomCounts.map(k => (
                <div key={k.regne} className="px-4 py-2 bg-background border border-border/50 rounded-full text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <span className="text-foreground">{k.regne}</span>
                  <span className="bg-muted px-2 py-0.5 rounded-full text-xs">{k.count.toLocaleString("fr-FR")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-24 px-4 container mx-auto max-w-5xl">
        <h2 className="text-3xl font-serif font-semibold mb-10 text-center">Les grands regnes</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <FeaturedCard 
            title="Animalia" 
            desc="Des invertebres microscopiques aux mammiferes."
            fallbackImage={animaliaImg}
            cdNom={183716}
          />
          <FeaturedCard 
            title="Plantae" 
            desc="Plantes a fleurs, fougeres, mousses et algues vertes."
            fallbackImage={plantaeImg}
            cdNom={187079}
          />
          <FeaturedCard 
            title="Fungi" 
            desc="Champignons, moisissures et levures."
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

function FeaturedCard({ title, desc, fallbackImage, cdNom }: { title: string, desc: string, fallbackImage: string, cdNom: number }) {
  return (
    <Link href={taxonUrl(cdNom, title)} className="group block">
      <div className="relative h-64 rounded-2xl overflow-hidden mb-4 bg-muted">
        <img 
          src={fallbackImage} 
          alt={title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <h3 className="absolute bottom-4 left-4 text-2xl font-serif font-bold text-white">{title}</h3>
      </div>
      <p className="text-muted-foreground group-hover:text-foreground transition-colors">{desc}</p>
    </Link>
  );
}
