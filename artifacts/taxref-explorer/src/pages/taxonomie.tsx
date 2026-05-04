import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetTaxonStats } from "@workspace/api-client-react";
import { ShieldAlert, X, Network, ShieldCheck, HeartPulse, Stars, MapPin, Bug, LayoutGrid, BarChart3, Info } from "lucide-react";
import { useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { taxonUrl } from "@/lib/constants";
import { TaxonomyTreemap } from "@/components/TaxonomyTreemap";
import { UicnBarometer } from "@/components/UicnBarometer";
import { localeNumber } from "@/i18n";

type StatusInfo = { description: string; href?: string };

// Glossaire scientifique (BdC Statuts / INPN) — conservé en français de référence.
// Les éléments d'interface autour sont traduits.
const STATUS_DESCRIPTIONS: Record<string, StatusInfo> = {
  LRN: {
    description:
      "Liste rouge nationale UICN — évalue le risque de disparition des espèces sur le territoire français selon la méthodologie standardisée de l'UICN. Co-pilotée par le Comité français de l'UICN et le MNHN.",
    href: "https://uicn.fr/liste-rouge-france/",
  },
  LRR: {
    description:
      "Liste rouge régionale — déclinaison de la méthode UICN à l'échelle d'une région administrative, conduite par les CSRPN et les comités régionaux UICN.",
    href: "https://uicn.fr/listes-rouges-regionales/",
  },
  LRM: {
    description:
      "Liste rouge mondiale UICN — référence internationale du risque d'extinction des espèces, mise à jour par les groupes de spécialistes de l'UICN.",
    href: "https://www.iucnredlist.org/",
  },
  LRE: {
    description:
      "Liste rouge européenne UICN — évaluation du risque d'extinction à l'échelle de l'Europe (UE 27 + pays voisins), réalisée pour le compte de la Commission européenne.",
    href: "https://www.iucn.org/regions/europe/our-work/biodiversity-conservation/european-red-list-threatened-species",
  },
  DH: {
    description:
      "Directive 92/43/CEE « Habitats-Faune-Flore » — annexes II (sites Natura 2000), IV (protection stricte sur tout le territoire UE) et V (prélèvement encadré). Pilier de Natura 2000 avec la Directive Oiseaux.",
    href: "https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:31992L0043",
  },
  DO: {
    description:
      "Directive 2009/147/CE « Oiseaux » — protection de toutes les espèces d'oiseaux sauvages de l'Union européenne. Annexes I (sites Natura 2000), II (chasse), III (commercialisation).",
    href: "https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32009L0147",
  },
  PN: {
    description:
      "Protection nationale — espèces protégées par arrêtés ministériels pris en application des articles L.411-1 et L.411-2 du Code de l'environnement. Interdisent destruction, capture, transport, perturbation intentionnelle, etc.",
    href: "https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000006143734/",
  },
  PR: {
    description:
      "Protection régionale — arrêtés préfectoraux de région complétant la protection nationale, principalement pour la flore.",
  },
  PD: {
    description:
      "Protection départementale — arrêtés préfectoraux départementaux complétant la protection nationale (notamment outre-mer et régions à forts enjeux).",
  },
  ZDET: {
    description:
      "Espèces déterminantes ZNIEFF — espèces dont la présence justifie la création d'une Zone Naturelle d'Intérêt Écologique, Faunistique et Floristique. Listes validées par les CSRPN.",
    href: "https://inpn.mnhn.fr/programme/inventaire-znieff/presentation",
  },
  PNA: {
    description:
      "Plan national d'actions — outils de protection ciblés pour les espèces les plus menacées : déclinaison opérationnelle de la stratégie nationale biodiversité, pilotée par le ministère chargé de l'écologie (DREAL/DEAL).",
    href: "https://www.ecologie.gouv.fr/plans-nationaux-dactions-en-faveur-des-especes-menacees",
  },
  exPNA: {
    description:
      "Anciens Plans nationaux d'actions — espèces ayant bénéficié d'un PNA aujourd'hui clos.",
  },
  BERN: {
    description:
      "Convention de Berne (1979) — convention du Conseil de l'Europe relative à la conservation de la vie sauvage et du milieu naturel. Annexes I (flore strictement protégée), II (faune strictement protégée), III (faune protégée).",
    href: "https://www.coe.int/fr/web/bern-convention",
  },
  BONN: {
    description:
      "Convention de Bonn (CMS, 1979) — convention sur la conservation des espèces migratrices appartenant à la faune sauvage. Annexes I (en danger), II (à conserver via accords) et accords régionaux (AEWA, EUROBATS, ASCOBANS, etc.).",
    href: "https://www.cms.int/fr",
  },
  OSPAR: {
    description:
      "Convention OSPAR — protection du milieu marin de l'Atlantique du Nord-Est. Liste des espèces et habitats menacés et/ou en déclin.",
    href: "https://www.ospar.org/",
  },
  BARC: {
    description:
      "Convention de Barcelone — protection du milieu marin et du littoral de la Méditerranée. Annexes II (espèces en danger ou menacées) et III (espèces dont l'exploitation est réglementée).",
    href: "https://www.unep.org/unepmap/",
  },
  REGL: {
    description:
      "Réglementation diverses — arrêtés et décrets encadrant prélèvement, commerce, transport, détention d'espèces (chasse, pêche, fourrure, oisellerie, etc.).",
  },
  REGLII: {
    description:
      "Espèces exotiques envahissantes — réglementation à l'introduction (règlement UE 1143/2014 et déclinaisons nationales/territoriales). Interdiction d'importation, de détention, de transport, etc.",
    href: "https://www.ecologie.gouv.fr/especes-exotiques-envahissantes",
  },
  REGLLUTTE: {
    description:
      "Espèces exotiques envahissantes — réglementation imposant la lutte active (arrachage, destruction, gestion populationnelle).",
  },
  REGLSO: {
    description:
      "Réglementations spécifiques outre-mer — encadrement des espèces dans les collectivités d'outre-mer (Guadeloupe, Martinique, Guyane, Réunion, Mayotte, etc.).",
  },
  POM: {
    description:
      "Pêcheries / espèces marines — encadrement spécifique de certaines espèces marines (tailles, quotas, zones).",
  },
  SENSNAT: {
    description:
      "Sensibilité de diffusion (national) — niveau (1 à 3) défini par le SINP indiquant si la diffusion publique précise des observations d'une espèce risque de la mettre en danger (collecte, dérangement).",
    href: "https://inpn.mnhn.fr/docs/donnees_sensibles/MethodeNationaleSensibilite.pdf",
  },
  SENSREG: {
    description:
      "Sensibilité de diffusion (régional) — déclinaison régionale du niveau de sensibilité des données d'observation.",
  },
  SENSDEP: {
    description:
      "Sensibilité de diffusion (départemental) — déclinaison départementale du niveau de sensibilité des données.",
  },
};

export default function Taxonomie() {
  const { data: stats } = useGetTaxonStats();
  const [, navigate] = useLocation();
  const [treeData, setTreeData] = useState<any>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [statutType, setStatutType] = useState<string>("");
  const [view, setView] = useState<"treemap" | "barometer">("barometer");
  const [statusTypes, setStatusTypes] = useState<{ code: string; label: string; taxa: number; group?: string }[]>([]);
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || "fr";

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
        <html lang={lang} />
        <title>{t("taxonomie.title")}</title>
        <meta name="description" content={t("taxonomie.metaDescription")} />
      </Helmet>

      <section className="pt-16 pb-10 px-4">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center justify-center p-2 bg-primary/10 rounded-2xl mb-5 ring-1 ring-primary/20">
            <Network className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4 leading-tight">
            {t("taxonomie.heading")}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t("taxonomie.subtitle")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: "rgba(45, 122, 76, 0.10)", color: "#2d7a4c", borderColor: "rgba(45, 122, 76, 0.25)" }}>
              <ShieldCheck className="w-3.5 h-3.5" />
              {t("taxonomie.chipProtection")}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: "rgba(192, 57, 43, 0.10)", color: "#a02e22", borderColor: "rgba(192, 57, 43, 0.25)" }}>
              <HeartPulse className="w-3.5 h-3.5" />
              {t("taxonomie.chipUicn")}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: "rgba(33, 90, 160, 0.10)", color: "#215aa0", borderColor: "rgba(33, 90, 160, 0.25)" }}>
              <Stars className="w-3.5 h-3.5" />
              {t("taxonomie.chipNatura")}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: "rgba(120, 75, 145, 0.10)", color: "#6a4082", borderColor: "rgba(120, 75, 145, 0.25)" }}>
              <MapPin className="w-3.5 h-3.5" />
              {t("taxonomie.chipZnieff")}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: "rgba(217, 119, 36, 0.12)", color: "#a85e1a", borderColor: "rgba(217, 119, 36, 0.28)" }}>
              <Bug className="w-3.5 h-3.5" />
              {t("taxonomie.chipInvasive")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/80 max-w-2xl mx-auto mt-6 leading-relaxed">
            <span className="font-medium">{t("taxonomie.sourcesNote")}</span>{" "}
            <a href="https://inpn.mnhn.fr/programme/referentiel-taxonomique-taxref" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground">TAXREF v18</a> · <a href="https://inpn.mnhn.fr/telechargement/referentielEspece/bdc-statuts-especes" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground">BdC Statuts</a> · <a href="https://www.patrinat.fr/" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground">PatriNat</a> (OFB – MNHN – CNRS – IRD) · <a href="https://inpn.mnhn.fr/" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground">INPN</a> · <a href="https://uicn.fr/liste-rouge-france/" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground">UICN France &amp; MNHN</a>.
          </p>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 px-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
              <ShieldAlert className="w-4 h-4" />
              <span>{t("taxonomie.filterLabel")}</span>
            </div>
            <div className="relative flex-1 w-full sm:w-auto sm:max-w-md">
              <select
                value={statutType}
                onChange={(e) => setStatutType(e.target.value)}
                className="w-full appearance-none bg-background border border-border rounded-full pl-4 pr-10 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                data-testid="select-status-type"
              >
                <option value="">{t("taxonomie.allSpecies")} ({stats?.totalTaxons ? localeNumber(stats.totalTaxons, lang) : "..."})</option>
                {Object.entries(
                  statusTypes.reduce<Record<string, typeof statusTypes>>((acc, s) => {
                    const g = s.group || "—";
                    (acc[g] ||= []).push(s);
                    return acc;
                  }, {})
                ).map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map(s => (
                      <option key={s.code} value={s.code}>{s.label} ({localeNumber(s.taxa, lang)})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {statutType && (
                <button
                  type="button"
                  onClick={() => setStatutType("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={t("taxonomie.clearFilter")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="sm:ml-auto inline-flex rounded-full border border-border bg-background p-1 text-xs">
              <button
                type="button"
                onClick={() => setView("treemap")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${view === "treemap" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="view-treemap"
                aria-pressed={view === "treemap"}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                {t("taxonomie.viewTreemap")}
              </button>
              <button
                type="button"
                onClick={() => setView("barometer")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${view === "barometer" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="view-barometer"
                aria-pressed={view === "barometer"}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                {t("taxonomie.viewBarometer")}
              </button>
            </div>
          </div>
          {statutType && STATUS_DESCRIPTIONS[statutType] && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-muted/40 border border-border/60 flex items-start gap-3" data-testid="status-description">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="text-xs text-foreground/80 leading-relaxed">
                <span className="font-medium text-foreground">
                  {statusTypes.find((s) => s.code === statutType)?.label || statutType}
                </span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                {STATUS_DESCRIPTIONS[statutType].description}
                {STATUS_DESCRIPTIONS[statutType].href && (
                  <>
                    {" "}
                    <a
                      href={STATUS_DESCRIPTIONS[statutType].href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-dotted hover:text-foreground"
                    >
                      {t("taxonomie.learnMore")}
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
          {view === "barometer" ? (
            <UicnBarometer
              statutType={statutType}
              statutLabel={statusTypes.find((s) => s.code === statutType)?.label}
            />
          ) : treeData && !treeLoading ? (
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
              <div className="animate-pulse text-muted-foreground">{t("taxonomie.loadingTaxonomy")}</div>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
