import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Network } from "lucide-react";
import { taxonUrl } from "@/lib/constants";
import { CollapsibleSection } from "./CollapsibleSection";

interface InteractionPartner {
  name: string;
  cdNom: number | null;
  rang: string | null;
  nomVern: string | null;
}
interface InteractionGroup {
  id: string;
  label: string;
  count: number;
  partners: InteractionPartner[];
}
interface InteractionsPayload {
  sourceTaxon: string;
  cdNom: number;
  totalPartners: number;
  groups: InteractionGroup[];
  attribution: { source: string; url: string };
}

export function InteractionsSection({ cdNom }: { cdNom: number }) {
  const [data, setData] = useState<InteractionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(false);
    fetch(`${import.meta.env.BASE_URL}api/taxons/${cdNom}/interactions`)
      .then(async (r) => {
        if (r.status === 404) return null; // no taxon → silently hide
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => { if (!cancelled) setData(j); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cdNom]);

  if (loading) return <Skeleton className="h-14 w-full rounded-2xl" />;
  if (error) {
    return (
      <CollapsibleSection
        icon={<Network className="w-4 h-4 text-primary" />}
        title="Réseau trophique"
        count={0}
        defaultOpen={false}
      >
        <p className="text-xs text-muted-foreground">
          Service GloBI momentanément indisponible. Réessayez plus tard.
        </p>
      </CollapsibleSection>
    );
  }
  if (!data || data.totalPartners === 0) return null;

  return (
    <CollapsibleSection
      icon={<Network className="w-4 h-4 text-primary" />}
      title="Réseau trophique"
      count={data.totalPartners}
      defaultOpen={false}
    >
      <div className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Interactions documentées pour <span className="italic font-medium">{data.sourceTaxon}</span> selon{" "}
          <a href={data.attribution.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            GloBI
          </a>.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {data.groups.map((g) => {
            const isExpanded = expandedGroups[g.id] ?? false;
            const PREVIEW = 12;
            const visible = isExpanded ? g.partners : g.partners.slice(0, PREVIEW);
            return (
              <div key={g.id} className="bg-background border border-border rounded-xl p-4" data-testid={`interaction-group-${g.id}`}>
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">{g.label}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{g.count}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {visible.map((p) => p.cdNom ? (
                    <Link
                      key={`${g.id}-${p.name}`}
                      href={taxonUrl(p.cdNom, p.name)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-primary/5 text-foreground hover:bg-primary/10 hover:text-primary border border-primary/10 rounded-full transition-colors"
                      data-testid={`partner-${p.cdNom}`}
                      title={p.nomVern || undefined}
                    >
                      <span className="italic">{p.name}</span>
                      {p.nomVern && <span className="text-muted-foreground/80 text-[10px] not-italic truncate max-w-[120px]">{p.nomVern.split(",")[0].trim()}</span>}
                    </Link>
                  ) : (
                    <span
                      key={`${g.id}-${p.name}`}
                      className="inline-flex px-2.5 py-1 text-xs bg-muted/50 text-muted-foreground border border-border rounded-full italic"
                      title="Non référencé dans TAXREF"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
                {g.count > PREVIEW && (
                  <button
                    onClick={() => setExpandedGroups((s) => ({ ...s, [g.id]: !isExpanded }))}
                    className="mt-3 text-xs font-medium text-primary hover:underline"
                  >
                    {isExpanded ? "Réduire" : `Afficher les ${g.count - PREVIEW} de plus`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground/70 italic pt-1 border-t border-border/40">
          Données fournies par {data.attribution.source} — agrégateur ouvert d'interactions biotiques. Les noms en gris ne sont pas (encore) référencés dans TAXREF.
        </p>
      </div>
    </CollapsibleSection>
  );
}
