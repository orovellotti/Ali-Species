import { Layout } from "@/components/Layout";
import { SearchAutocomplete } from "@/components/SearchAutocomplete";
import { useGetTaxonStats } from "@workspace/api-client-react";
import { Leaf, Trees, Microscope, BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

import animaliaImg from "@/assets/images/animalia.png";
import plantaeImg from "@/assets/images/plantae.png";
import fungiImg from "@/assets/images/fungi.png";

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetTaxonStats();

  return (
    <Layout>
      <section className="relative pt-24 pb-32 px-4 overflow-visible">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <div className="inline-flex items-center justify-center p-2 bg-primary/10 text-primary rounded-2xl mb-6 ring-1 ring-primary/20">
            <Leaf className="w-6 h-6" />
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-foreground mb-6 leading-tight">
            Explorez le monde vivant de la <span className="text-primary italic">France</span>.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Le referentiel taxonomique national couvrant la flore, la faune et les champignons. Base sur TAXREF v18, produit par PatriNat.
          </p>

          <SearchAutocomplete />
        </div>
      </section>

      <section className="py-16 bg-card border-y border-border">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-serif font-semibold">Le vivant en chiffres</h2>
            <p className="text-muted-foreground mt-2">Donnees du referentiel national</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {statsLoading || !stats ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="bg-background rounded-2xl p-6 text-center border border-border/50">
                  <Skeleton className="w-16 h-10 mx-auto mb-2" />
                  <Skeleton className="w-24 h-4 mx-auto" />
                </div>
              ))
            ) : (
              <>
                <StatCard icon={<Microscope className="w-4 h-4" />} value={stats.totalTaxons.toLocaleString("fr-FR")} label="Taxons" />
                <StatCard icon={<Trees className="w-4 h-4" />} value={stats.totalSpecies.toLocaleString("fr-FR")} label="Especes" />
                <StatCard icon={<Leaf className="w-4 h-4" />} value={stats.totalGenera.toLocaleString("fr-FR")} label="Genres" />
                <StatCard icon={<BookOpen className="w-4 h-4" />} value={stats.totalFamilies.toLocaleString("fr-FR")} label="Familles" />
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
          />
          <FeaturedCard 
            title="Plantae" 
            desc="Plantes a fleurs, fougeres, mousses et algues vertes."
            fallbackImage={plantaeImg}
          />
          <FeaturedCard 
            title="Fungi" 
            desc="Champignons, moisissures et levures."
            fallbackImage={fungiImg}
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

function FeaturedCard({ title, desc, fallbackImage }: { title: string, desc: string, fallbackImage: string }) {
  return (
    <Link href={`/?q=${title}`} className="group block">
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
