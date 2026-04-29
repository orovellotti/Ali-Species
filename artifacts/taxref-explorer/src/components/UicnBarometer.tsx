import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

type Item = {
  regne: string;
  classe: string;
  total: number;
  threatened: number;
  pctMenace: number;
  codes: Record<string, number>;
};

type Props = {
  statutType: string;
  statutLabel?: string;
};

const UICN_ORDER = ["EX", "RE", "CR", "EN", "VU", "NT", "LC", "DD", "NA"] as const;

const UICN_COLORS: Record<string, string> = {
  RE: "#5e1a1a",
  CR: "#c0392b",
  EN: "#e5762b",
  VU: "#f0b53c",
  NT: "#c9d24a",
  LC: "#5fa55a",
  DD: "#9a9a9a",
  NA: "#cfcfcf",
  EX: "#3a0f0f",
};

const UICN_LABELS: Record<string, string> = {
  LC: "LC — Préoccupation mineure",
  NT: "NT — Quasi menacée",
  VU: "VU — Vulnérable",
  EN: "EN — En danger",
  CR: "CR — En danger critique",
  RE: "RE — Disparue de France",
  EX: "EX — Éteinte",
  DD: "DD — Données insuffisantes",
  NA: "NA — Non applicable",
};

const REGNE_COLORS: Record<string, string> = {
  Animalia: "#3b6e8f",
  Plantae: "#5a8a3a",
  Fungi: "#a06840",
  Chromista: "#7a4a8c",
  Protozoa: "#b88c3a",
  Bacteria: "#6a6a6a",
  Archaea: "#6a6a6a",
};

export function UicnBarometer({ statutType, statutLabel }: Props) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    const url = statutType
      ? `/api/taxons/uicn-by-class?statutType=${encodeURIComponent(statutType)}`
      : "/api/taxons/uicn-by-class";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (ignore) return;
        setItems(d.items ?? []);
      })
      .catch((e) => {
        if (ignore) return;
        setError(String(e));
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [statutType]);

  const grandTotal = useMemo(
    () => (items ?? []).reduce((s, it) => s + it.total, 0),
    [items]
  );
  const grandThreatened = useMemo(
    () => (items ?? []).reduce((s, it) => s + it.threatened, 0),
    [items]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Chargement du baromètre…
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-12 text-center text-sm text-red-600">
        Erreur : {error}
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Aucune classe avec données Liste rouge pour ce filtre.
      </div>
    );
  }

  const top = items.slice(0, 30);

  return (
    <div className="bg-background border border-border rounded-2xl p-5 md:p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
        <div>
          <h3 className="text-lg font-serif font-semibold text-foreground">
            Baromètre Liste rouge nationale (UICN)
            {statutType && statutLabel ? (
              <span className="block sm:inline text-sm font-sans font-normal text-muted-foreground sm:ml-2">
                — restreint aux espèces : {statutLabel}
              </span>
            ) : null}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Distribution des catégories UICN par classe taxonomique, classée par
            % d'espèces menacées (VU + EN + CR + RE) décroissant.
            {statutType ? " Le filtre du haut restreint la population analysée à ce sous-ensemble." : null}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {grandTotal.toLocaleString("fr-FR")}
          </span>{" "}
          espèces évaluées, dont{" "}
          <span className="font-medium" style={{ color: UICN_COLORS.EN }}>
            {grandThreatened.toLocaleString("fr-FR")}{" "}
            ({grandTotal > 0
              ? ((grandThreatened / grandTotal) * 100).toFixed(1)
              : "0"}
            %) menacées
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-5 text-[11px]">
        {UICN_ORDER.map((code) => (
          <div key={code} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: UICN_COLORS[code] }}
            />
            <span className="text-muted-foreground">{UICN_LABELS[code]}</span>
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {top.map((it) => {
          const segments = UICN_ORDER.filter((c) => (it.codes[c] || 0) > 0);
          const dot = REGNE_COLORS[it.regne] || "#888";
          return (
            <div
              key={`${it.regne}-${it.classe}`}
              className="grid grid-cols-[140px_1fr_90px] sm:grid-cols-[180px_1fr_110px] items-center gap-3"
              data-testid={`barometer-row-${it.classe}`}
            >
              {/* Class label */}
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: dot }}
                  title={it.regne}
                />
                <span
                  className="text-xs sm:text-sm font-medium text-foreground truncate"
                  title={`${it.classe} (${it.regne})`}
                >
                  {it.classe}
                </span>
              </div>

              {/* Stacked bar */}
              <div
                className="relative h-6 rounded-md overflow-hidden bg-muted/40 flex"
                title={`${it.total.toLocaleString("fr-FR")} espèces évaluées`}
              >
                {segments.map((code) => {
                  const n = it.codes[code] || 0;
                  const pct = (n / it.total) * 100;
                  return (
                    <div
                      key={code}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: UICN_COLORS[code],
                      }}
                      title={`${UICN_LABELS[code]} : ${n.toLocaleString("fr-FR")} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>

              {/* Stats */}
              <div className="text-[11px] sm:text-xs text-right tabular-nums">
                <div className="font-semibold text-foreground">
                  {it.pctMenace.toFixed(1)}%
                </div>
                <div className="text-muted-foreground">
                  {it.total.toLocaleString("fr-FR")} esp.
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {items.length > top.length && (
        <p className="mt-4 text-[11px] text-muted-foreground text-center italic">
          Affichage des {top.length} classes les plus menacées sur {items.length}.
        </p>
      )}
    </div>
  );
}
