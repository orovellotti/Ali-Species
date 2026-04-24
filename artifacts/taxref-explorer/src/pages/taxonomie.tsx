import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetTaxonStats } from "@workspace/api-client-react";
import { ShieldAlert, X, Network } from "lucide-react";
import { useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { taxonUrl } from "@/lib/constants";
import { TaxonomyTreemap } from "@/components/TaxonomyTreemap";

export default function Taxonomie() {
  const { data: stats } = useGetTaxonStats();
  const [, navigate] = useLocation();
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

  return (
    <Layout>
      <Helmet>
        <title>Arbre taxonomique — ALI Species</title>
        <meta name="description" content="Explorez visuellement la taxonomie du vivant en France : règnes, phyla, classes, ordres et familles. Filtrez par statut de conservation." />
      </Helmet>

      <section className="pt-16 pb-10 px-4">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center justify-center p-2 bg-primary/10 rounded-2xl mb-5 ring-1 ring-primary/20">
            <Network className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4 leading-tight">
            Arbre taxonomique
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Naviguez la classification du vivant — des règnes jusqu'aux familles. Filtrez par statut pour visualiser les espèces protégées, menacées ou invasives.
          </p>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
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
          {treeData && !treeLoading ? (
            <TaxonomyTreemap
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
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-[420px] border border-border rounded-xl bg-card">
              <div className="animate-pulse text-muted-foreground">Chargement de la taxonomie...</div>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
