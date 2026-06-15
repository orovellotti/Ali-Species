import { useState, useMemo } from "react";
import type { BdcStatut } from "@workspace/api-client-react";
import { ScrollText, Activity, AlertTriangle, Info, ChevronDown, ExternalLink } from "lucide-react";
import { computeSensitivity, LR_CODE_COLORS } from "@/lib/sensitivity";
import { CollapsibleSection } from "./CollapsibleSection";
import { ScoreRing, SensitivityRadar, DimensionBar, dimensionColors } from "./SensitivityWidgets";

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

const ALLOWED_CITATION_TAGS = new Set(["EM", "I", "B", "STRONG", "BR"]);

/**
 * Sanitize a bibliographic citation that may contain a tiny subset of inline
 * HTML (italics for genus/species, line breaks). Uses DOMParser, which
 * produces an inert document: scripts are not executed, external resources
 * (img/iframe/etc.) are not loaded, and inline event handlers do not fire
 * even if present in the input. We then walk the tree and strip any tag
 * outside the allowlist, plus all attributes on the surviving tags.
 */
function sanitizeCitation(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (node: Node) => {
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      const child = node.childNodes[i];
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (!ALLOWED_CITATION_TAGS.has(el.tagName)) {
          while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el);
          el.remove();
        } else {
          while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
          walk(el);
        }
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function StatutsSection({ statuts }: { statuts: BdcStatut[] }) {
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
            <div className="flex flex-col sm:flex-row items-start gap-5">
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
                      <span key={i} title={d.title || d.label} className={`px-2 py-0.5 rounded-full text-xs font-semibold ${d.badgeClass}`}>
                        {d.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 mx-auto sm:mx-0">
                <SensitivityRadar
                  ecological={sensitivity.ecological}
                  regulatory={sensitivity.regulatory}
                  territorial={sensitivity.territorial}
                  management={sensitivity.management}
                  fillClass={dimensionColors(sensitivity.label).fill}
                  strokeClass={dimensionColors(sensitivity.label).stroke}
                />
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
