import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

type Item = {
  regne: string;
  classe: string;
  total: number;
  classTotal?: number;
  pctConcerned?: number;
  threatened?: number;
  pctMenace?: number;
  codes: Record<string, number>;
};

type ApiResp = {
  statutType: string;
  lbType: string;
  isUicn: boolean;
  items: Item[];
};

type Props = {
  statutType: string;
  statutLabel?: string;
};

// ---------- Per-status-type display registry ----------

type CodeInfo = { label: string; color: string; threat?: boolean };
type TypeProfile = {
  title: string;
  subtitle: string;
  codes: Record<string, CodeInfo>;
  fallbackPalette: string[];
};

const NEUTRAL_PALETTE = [
  "#3b6e8f",
  "#5fa55a",
  "#a06840",
  "#c9d24a",
  "#e5762b",
  "#7a4a8c",
  "#5e7a8f",
  "#b88c3a",
  "#aaaaaa",
  "#6a6a6a",
];

const UICN_PROFILE: TypeProfile = {
  title: "Liste rouge nationale (UICN)",
  subtitle:
    "Distribution des catégories UICN par classe taxonomique, classée par % d'espèces menacées (VU + EN + CR + RE + EX) décroissant.",
  codes: {
    EX: { label: "EX — Éteinte", color: "#3a0f0f", threat: true },
    EW: { label: "EW — Éteinte à l'état sauvage", color: "#4a1a1a", threat: true },
    RE: { label: "RE — Disparue de France", color: "#5e1a1a", threat: true },
    "CR*": { label: "CR* — En danger critique (présumée disparue)", color: "#9b2419", threat: true },
    CR: { label: "CR — En danger critique", color: "#c0392b", threat: true },
    EN: { label: "EN — En danger", color: "#e5762b", threat: true },
    VU: { label: "VU — Vulnérable", color: "#f0b53c", threat: true },
    NT: { label: "NT — Quasi menacée", color: "#c9d24a" },
    LC: { label: "LC — Préoccupation mineure", color: "#5fa55a" },
    DD: { label: "DD — Données insuffisantes", color: "#9a9a9a" },
    NA: { label: "NA — Non applicable", color: "#cfcfcf" },
    NE: { label: "NE — Non évaluée", color: "#dcdcdc" },
    "RE?": { label: "RE? — Disparition possible", color: "#7a3030", threat: true },
  },
  fallbackPalette: NEUTRAL_PALETTE,
};

const PROFILES: Record<string, TypeProfile> = {
  LRN: UICN_PROFILE,
  LRR: { ...UICN_PROFILE, title: "Liste rouge régionale (UICN)" },
  LRM: { ...UICN_PROFILE, title: "Liste rouge mondiale (UICN)" },
  LRE: { ...UICN_PROFILE, title: "Liste rouge européenne (UICN)" },
  DH: {
    title: "Directive Habitats-Faune-Flore",
    subtitle:
      "Répartition des espèces inscrites aux annexes II, IV et V de la Directive 92/43/CEE par classe taxonomique.",
    codes: {
      CDH2: { label: "Annexe II — sites Natura 2000", color: "#1f5fa6" },
      CDH4: { label: "Annexe IV — protection stricte", color: "#3b86c8" },
      CDH5: { label: "Annexe V — prélèvement encadré", color: "#7eb3df" },
    },
    fallbackPalette: NEUTRAL_PALETTE,
  },
  DO: {
    title: "Directive Oiseaux",
    subtitle:
      "Répartition des oiseaux inscrits aux annexes de la Directive 2009/147/CE par classe.",
    codes: {
      CDO1: { label: "Annexe I — sites Natura 2000", color: "#1f5fa6" },
      CDO21: { label: "Annexe II/1 — chassables UE", color: "#3b86c8" },
      CDO22: { label: "Annexe II/2 — chassables locales", color: "#5896c9" },
      CDO31: { label: "Annexe III/1 — commercialisables UE", color: "#7eb3df" },
      CDO32: { label: "Annexe III/2 — commercialisables locales", color: "#a3cdec" },
    },
    fallbackPalette: NEUTRAL_PALETTE,
  },
  PN: {
    title: "Protection nationale",
    subtitle:
      "Répartition des espèces protégées par arrêté ministériel par classe taxonomique. Codes = arrêtés du Code de l'environnement.",
    codes: {},
    fallbackPalette: ["#1d6b3a", "#2d7a4c", "#3e8a5e", "#4f9a70", "#60aa82", "#71ba94", "#82caa6", "#94dab8", "#a5eaca", "#b6fadc"],
  },
  PR: {
    title: "Protection régionale",
    subtitle: "Répartition des espèces protégées par arrêté régional, par classe.",
    codes: {},
    fallbackPalette: ["#1d6b3a", "#2d7a4c", "#3e8a5e", "#4f9a70", "#60aa82", "#71ba94", "#82caa6", "#94dab8", "#a5eaca", "#b6fadc"],
  },
  PD: {
    title: "Protection départementale",
    subtitle: "Répartition des espèces protégées par arrêté préfectoral départemental, par classe.",
    codes: {},
    fallbackPalette: ["#1d6b3a", "#2d7a4c", "#3e8a5e", "#4f9a70", "#60aa82", "#71ba94", "#82caa6", "#94dab8", "#a5eaca", "#b6fadc"],
  },
  ZDET: {
    title: "ZNIEFF déterminantes",
    subtitle: "Espèces déterminantes pour les ZNIEFF, comptées par classe.",
    codes: { TRUE: { label: "Espèce déterminante ZNIEFF", color: "#6a4082" } },
    fallbackPalette: ["#6a4082"],
  },
  PNA: {
    title: "Plans nationaux d'actions",
    subtitle: "Espèces concernées par un PNA, par classe.",
    codes: { TRUE: { label: "Sous PNA", color: "#2d7a4c" } },
    fallbackPalette: ["#2d7a4c"],
  },
  REGL: {
    title: "Réglementation",
    subtitle: "Répartition des espèces sous réglementation spécifique, par classe.",
    codes: {},
    fallbackPalette: ["#a85e1a", "#b96e2b", "#ca7e3c", "#db8e4d", "#ec9e5e", "#fdae6f"],
  },
  REGLII: {
    title: "Réglementation introduction (EEE)",
    subtitle: "Espèces exotiques envahissantes réglementées à l'introduction, par classe.",
    codes: {},
    fallbackPalette: ["#c0392b", "#d04a3c", "#e05b4d", "#f06c5e", "#ff7d6f"],
  },
  REGLLUTTE: {
    title: "Réglementation lutte (EEE)",
    subtitle: "Espèces exotiques envahissantes réglementées à la lutte, par classe.",
    codes: {},
    fallbackPalette: ["#c0392b", "#d04a3c", "#e05b4d", "#f06c5e", "#ff7d6f"],
  },
  BERN: {
    title: "Convention de Berne",
    subtitle: "Inscription en annexes I, II et III de la Convention de Berne, par classe.",
    codes: {
      IBE1: { label: "Annexe I — flore strictement protégée", color: "#1f5fa6" },
      IBE2: { label: "Annexe II — faune strictement protégée", color: "#3b86c8" },
      IBE3: { label: "Annexe III — faune protégée", color: "#7eb3df" },
    },
    fallbackPalette: NEUTRAL_PALETTE,
  },
  BONN: {
    title: "Convention de Bonn",
    subtitle: "Inscription dans la Convention sur les espèces migratrices, par classe.",
    codes: {},
    fallbackPalette: NEUTRAL_PALETTE,
  },
  SENSNAT: {
    title: "Sensibilité de diffusion (national)",
    subtitle: "Niveau de sensibilité national pour la diffusion des données (1 = faible, 3 = très sensible).",
    codes: {
      "1": { label: "Niveau 1 — sensibilité faible", color: "#5fa55a" },
      "2": { label: "Niveau 2 — sensibilité modérée", color: "#f0b53c" },
      "3": { label: "Niveau 3 — sensibilité forte", color: "#c0392b" },
    },
    fallbackPalette: NEUTRAL_PALETTE,
  },
  SENSREG: {
    title: "Sensibilité de diffusion (régional)",
    subtitle: "Niveau de sensibilité régional (1 = faible, 3 = très sensible).",
    codes: {
      "1": { label: "Niveau 1", color: "#5fa55a" },
      "2": { label: "Niveau 2", color: "#f0b53c" },
      "3": { label: "Niveau 3", color: "#c0392b" },
    },
    fallbackPalette: NEUTRAL_PALETTE,
  },
  SENSDEP: {
    title: "Sensibilité de diffusion (départemental)",
    subtitle: "Niveau de sensibilité départemental (1 = faible, 3 = très sensible).",
    codes: {
      "1": { label: "Niveau 1", color: "#5fa55a" },
      "2": { label: "Niveau 2", color: "#f0b53c" },
      "3": { label: "Niveau 3", color: "#c0392b" },
    },
    fallbackPalette: NEUTRAL_PALETTE,
  },
};

const DEFAULT_PROFILE: TypeProfile = {
  title: "Statut",
  subtitle: "Répartition des codes de statut par classe taxonomique.",
  codes: {},
  fallbackPalette: NEUTRAL_PALETTE,
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

const MAX_VISIBLE_CODES = 10;

export function UicnBarometer({ statutType, statutLabel }: Props) {
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"threat" | "total">("threat");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statutType) params.set("statutType", statutType);
    const url = `/api/taxons/status-by-class${params.toString() ? `?${params.toString()}` : ""}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ApiResp) => {
        if (ignore) return;
        setResp(d);
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

  const profile = (resp && PROFILES[resp.statutType]) || DEFAULT_PROFILE;

  // Compute the set of visible codes (top by global count) + an "Autres" bucket.
  const { codeOrder, codeMeta } = useMemo(() => {
    if (!resp) return { codeOrder: [] as string[], codeMeta: {} as Record<string, CodeInfo> };
    const totals: Record<string, number> = {};
    for (const it of resp.items) {
      for (const [c, n] of Object.entries(it.codes)) {
        totals[c] = (totals[c] || 0) + n;
      }
    }
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const visible = sorted.slice(0, MAX_VISIBLE_CODES).map(([c]) => c);
    const meta: Record<string, CodeInfo> = {};
    visible.forEach((c, i) => {
      const known = profile.codes[c];
      meta[c] = known ?? {
        label: c,
        color: profile.fallbackPalette[i % profile.fallbackPalette.length],
      };
    });
    if (sorted.length > MAX_VISIBLE_CODES) {
      meta["__other__"] = { label: "Autres", color: "#bcbcbc" };
      visible.push("__other__");
    }
    // For UICN-like, prefer logical severity order rather than count order.
    if (resp.isUicn) {
      const severity = ["EX", "EW", "RE", "RE?", "CR*", "CR", "EN", "VU", "NT", "LC", "DD", "NA", "NE"];
      visible.sort((a, b) => {
        const ia = severity.indexOf(a);
        const ib = severity.indexOf(b);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }
    return { codeOrder: visible, codeMeta: meta };
  }, [resp, profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Chargement du baromètre…
      </div>
    );
  }
  if (error) {
    return <div className="py-12 text-center text-sm text-red-600">Erreur : {error}</div>;
  }
  if (!resp || resp.items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Aucune classe avec données pour ce statut.
      </div>
    );
  }

  const grandTotal = resp.items.reduce((s, it) => s + it.total, 0);
  const grandThreatened = resp.isUicn
    ? resp.items.reduce((s, it) => s + (it.threatened || 0), 0)
    : 0;
  const headerSubject = statutType && statutLabel ? statutLabel : profile.title;

  // Group by règne, keep at most 12 classes per group, then sort règnes by total desc.
  const PER_GROUP_LIMIT = 12;
  const byRegne = new Map<string, Item[]>();
  for (const it of resp.items) {
    const arr = byRegne.get(it.regne) ?? [];
    arr.push(it);
    byRegne.set(it.regne, arr);
  }
  const showTotalMetric = !resp.isUicn || metric === "total";
  const groups = Array.from(byRegne.entries())
    .map(([regne, arr]) => {
      const total = arr.reduce((s, it) => s + it.total, 0);
      const threatened = arr.reduce((s, it) => s + (it.threatened || 0), 0);
      const sorted = showTotalMetric
        ? [...arr].sort((a, b) => b.total - a.total)
        : arr;
      return {
        regne,
        total,
        threatened,
        classCount: arr.length,
        rows: sorted.slice(0, PER_GROUP_LIMIT),
        truncated: Math.max(0, arr.length - PER_GROUP_LIMIT),
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="bg-background border border-border rounded-2xl p-5 md:p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
        <div>
          <h3 className="text-lg font-serif font-semibold text-foreground">
            Baromètre — {headerSubject}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            {profile.subtitle}
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          <div className="text-xs text-muted-foreground text-left sm:text-right">
            <span className="font-medium text-foreground">
              {grandTotal.toLocaleString("fr-FR")}
            </span>{" "}
            espèces concernées
            {resp.isUicn && grandTotal > 0 && (
              <>
                , dont{" "}
                <span className="font-medium" style={{ color: "#c0392b" }}>
                  {grandThreatened.toLocaleString("fr-FR")} (
                  {((grandThreatened / grandTotal) * 100).toFixed(1)}%) menacées
                </span>
              </>
            )}
          </div>
          {resp.isUicn && (
            <div
              className="inline-flex items-center text-[11px] rounded-full bg-muted/60 p-0.5"
              role="group"
              aria-label="Choisir la métrique affichée par classe"
            >
              <button
                type="button"
                onClick={() => setMetric("threat")}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  metric === "threat"
                    ? "bg-background shadow-sm text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={metric === "threat"}
                data-testid="metric-threat"
              >
                % menacées
              </button>
              <button
                type="button"
                onClick={() => setMetric("total")}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  metric === "total"
                    ? "bg-background shadow-sm text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={metric === "total"}
                data-testid="metric-total"
              >
                Total espèces
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-5 text-[11px]">
        {codeOrder.map((c) => (
          <div key={c} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: codeMeta[c]?.color || "#bbb" }}
            />
            <span className="text-muted-foreground">{codeMeta[c]?.label || c}</span>
          </div>
        ))}
      </div>

      {/* Groups */}
      <div className="space-y-6">
        {groups.map((g) => {
          const dot = REGNE_COLORS[g.regne] || "#888";
          const pctG = g.total > 0 ? (g.threatened / g.total) * 100 : 0;
          return (
            <div key={g.regne} data-testid={`barometer-group-${g.regne}`}>
              {/* Group header */}
              <div className="flex items-baseline justify-between gap-3 pb-2 mb-3 border-b border-border/60">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: dot }}
                  />
                  <h4 className="text-sm sm:text-base font-serif font-semibold text-foreground truncate">
                    {g.regne}
                  </h4>
                  <span className="text-[11px] text-muted-foreground italic">
                    {g.classCount} classe{g.classCount > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="text-[11px] sm:text-xs text-muted-foreground text-right shrink-0">
                  <span className="font-semibold text-foreground tabular-nums">
                    {g.total.toLocaleString("fr-FR")}
                  </span>{" "}
                  espèces
                  {resp.isUicn && g.total > 0 && (
                    <>
                      <span className="mx-1.5 text-muted-foreground/60">·</span>
                      <span style={{ color: "#c0392b" }} className="font-medium tabular-nums">
                        {g.threatened.toLocaleString("fr-FR")} ({pctG.toFixed(1)}%) menacées
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Class rows */}
              <div className="space-y-2">
                {g.rows.map((it) => {
                  const segments: { code: string; n: number }[] = [];
                  let other = 0;
                  const visibleSet = new Set(codeOrder.filter((c) => c !== "__other__"));
                  for (const [c, n] of Object.entries(it.codes)) {
                    if (visibleSet.has(c)) continue;
                    other += n;
                  }
                  for (const c of codeOrder) {
                    if (c === "__other__") {
                      if (other > 0) segments.push({ code: c, n: other });
                    } else {
                      const n = it.codes[c] || 0;
                      if (n > 0) segments.push({ code: c, n });
                    }
                  }
                  return (
                    <div
                      key={`${it.regne}-${it.classe}`}
                      className="grid grid-cols-[140px_1fr_90px] sm:grid-cols-[180px_1fr_110px] items-center gap-3"
                      data-testid={`barometer-row-${it.classe}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pl-4">
                        <span
                          className="text-xs sm:text-sm font-medium text-foreground truncate"
                          title={`${it.classe} (${it.regne})`}
                        >
                          {it.classe}
                        </span>
                      </div>
                      <div
                        className="relative h-6 rounded-md overflow-hidden bg-muted/30 border border-border/40 flex"
                        title={
                          it.classTotal && it.classTotal > 0
                            ? `${it.total.toLocaleString("fr-FR")} concernées sur ${it.classTotal.toLocaleString("fr-FR")} espèces de la classe (${(it.pctConcerned ?? 0).toFixed(1)}%)`
                            : `${it.total.toLocaleString("fr-FR")} espèces concernées`
                        }
                      >
                        {(() => {
                          const rawPct = it.classTotal && it.classTotal > 0
                            ? (it.pctConcerned ?? 0)
                            : 100;
                          const fillPct = Math.min(100, rawPct);
                          return (
                            <div className="flex h-full" style={{ width: `${fillPct}%` }}>
                              {segments.map(({ code, n }) => {
                                const pct = (n / it.total) * 100;
                                const meta = codeMeta[code];
                                return (
                                  <div
                                    key={code}
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: meta?.color || "#bbb",
                                    }}
                                    title={`${meta?.label || code} : ${n.toLocaleString("fr-FR")} (${pct.toFixed(1)}%)`}
                                  />
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="text-[11px] sm:text-xs text-right tabular-nums">
                        <div className="font-semibold text-foreground">
                          {showTotalMetric
                            ? it.total.toLocaleString("fr-FR")
                            : `${(it.pctMenace ?? 0).toFixed(1)}%`}
                        </div>
                        <div
                          className="text-muted-foreground"
                          title={
                            it.classTotal
                              ? `${it.total.toLocaleString("fr-FR")} sur ${it.classTotal.toLocaleString("fr-FR")} espèces de la classe`
                              : undefined
                          }
                        >
                          {showTotalMetric
                            ? it.classTotal && it.classTotal > 0
                              ? `/ ${it.classTotal.toLocaleString("fr-FR")}`
                              : "espèces"
                            : `${it.total.toLocaleString("fr-FR")} esp.`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {g.truncated > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground italic pl-4">
                  + {g.truncated} autre{g.truncated > 1 ? "s" : ""} classe{g.truncated > 1 ? "s" : ""} non affichée{g.truncated > 1 ? "s" : ""}.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
