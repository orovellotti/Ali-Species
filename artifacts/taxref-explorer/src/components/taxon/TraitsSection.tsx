import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Database, ExternalLink } from "lucide-react";
import { CollapsibleSection } from "./CollapsibleSection";

interface TraitValue {
  id: string;
  label: string;
  value: string;
  unit?: string;
  source: string;
  sourceUrl: string;
}
interface StaticTraitField {
  id: string;
  label: string;
  value: string;
  unit?: string;
}
interface StaticTraitSource {
  source: string;
  sourceLabel: string;
  sourceUrl: string;
  license: string;
  citation: string;
  traits: StaticTraitField[];
}
interface TraitsPayload {
  scientificName: string;
  wikidataQid: string | null;
  wikidataUrl: string | null;
  itemLabel: string | null;
  itemDescription: string | null;
  imageUrl: string | null;
  traits: TraitValue[];
  externalIds: { id: string; label: string; value: string; url: string }[];
  attribution: { source: string; url: string; license: string };
  staticSources?: StaticTraitSource[];
  wikidataAvailable?: boolean;
}

export function TraitsSection({ cdNom }: { cdNom: number }) {
  const [data, setData] = useState<TraitsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(false);
    fetch(`${import.meta.env.BASE_URL}api/taxons/${cdNom}/traits`)
      .then(async (r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TraitsPayload>;
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
        icon={<Sparkles className="w-4 h-4 text-primary" />}
        title="Traits biologiques"
        defaultOpen={false}
      >
        <p className="text-xs text-muted-foreground">
          Service de traits momentanément indisponible. Réessayez plus tard.
        </p>
      </CollapsibleSection>
    );
  }
  if (!data) return null;

  const staticSources = data.staticSources || [];
  const staticTraitCount = staticSources.reduce((s, src) => s + src.traits.length, 0);
  const totalCount = data.traits.length + data.externalIds.length + staticTraitCount;
  if (totalCount === 0) return null;
  const headerCount = data.traits.length + staticTraitCount;

  return (
    <CollapsibleSection
      icon={<Sparkles className="w-4 h-4 text-primary" />}
      title="Traits biologiques"
      count={headerCount}
      defaultOpen={headerCount > 0}
    >
      {data.itemDescription && (
        <p className="text-sm text-muted-foreground mb-4 italic">{data.itemDescription}</p>
      )}

      {data.traits.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          {data.traits.map((t) => (
            <div
              key={t.id}
              className="p-3 bg-background border border-border rounded-xl"
              data-testid={`trait-${t.id}`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.label}
                </span>
                <a
                  href={t.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-medium text-primary/70 hover:text-primary inline-flex items-center gap-0.5"
                  title={`Source : ${t.source}`}
                >
                  {t.source}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <div className="text-base font-semibold text-foreground">
                {t.value}
                {t.unit && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">{t.unit}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {staticSources.map((src) => (
        <div
          key={src.source}
          className="mb-4 pt-3 border-t border-border/50"
          data-testid={`trait-source-${src.source}`}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {src.sourceLabel} <span className="text-muted-foreground/60 normal-case">· {src.traits.length} traits</span>
              </span>
            </div>
            <a
              href={src.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-medium text-primary/70 hover:text-primary inline-flex items-center gap-0.5"
              title={src.citation}
            >
              {src.license}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {src.traits.map((t) => (
              <div
                key={t.id}
                className="p-3 bg-background border border-border rounded-xl"
                data-testid={`trait-${src.source}-${t.id}`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.label}
                  </span>
                  <span className="text-[10px] font-medium text-primary/60" title={src.citation}>
                    {src.sourceLabel}
                  </span>
                </div>
                <div className="text-base font-semibold text-foreground">
                  {t.value}
                  {t.unit && (
                    <span className="text-sm font-normal text-muted-foreground ml-1">{t.unit}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {data.externalIds.length > 0 && (
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center gap-1.5 mb-2">
            <Database className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Référentiels externes
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.externalIds.map((x) => (
              <a
                key={x.id}
                href={x.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-muted hover:bg-muted/70 border border-border rounded-full text-foreground transition-colors"
                data-testid={`extid-${x.id}`}
              >
                {x.label}
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            ))}
          </div>
        </div>
      )}

      {data.wikidataUrl && (
        <p className="text-[11px] text-muted-foreground mt-4">
          Données agrégées depuis{" "}
          <a
            href={data.wikidataUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted hover:text-foreground"
          >
            Wikidata {data.wikidataQid}
          </a>
          {" "}(licence {data.attribution.license}). Chaque valeur reste sourcée individuellement.
        </p>
      )}
    </CollapsibleSection>
  );
}
