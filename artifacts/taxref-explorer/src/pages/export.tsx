import { Layout } from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Database, Download, ExternalLink, FileText, Network, Code2 } from "lucide-react";

interface ExportInfo {
  available: boolean;
  ttl?: { filename: string; sizeBytes: number; sizeMb: number; mtime: string; url: string };
  stats?: Record<string, string>;
}

interface SparqlStatus {
  loaded: boolean;
  triples?: number;
  error?: string;
}

function fmtInt(n: string | number | undefined): string {
  if (n === undefined || n === null || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString("fr-FR");
}

function fmtDate(iso: string | undefined, lang: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return iso;
  }
}

const SAMPLE_QUERIES: ReadonlyArray<{ id: string; titleKey: string; query: string }> = [
  {
    id: "carnivores-protected",
    titleKey: "exportPage.sampleCarnivores",
    query: `PREFIX dwc: <http://rs.tdwg.org/dwc/terms/>
PREFIX ali: <https://ali-species.org/vocab#>

SELECT ?taxon ?name ?status WHERE {
  ?taxon a dwc:Taxon ;
         dwc:scientificName ?name ;
         dwc:order "Carnivora" ;
         ali:hasStatus ?s .
  ?s ali:statutType "PN" ;
     ali:codeStatut ?status .
}
LIMIT 25`,
  },
  {
    id: "heaviest-mammals",
    titleKey: "exportPage.sampleHeaviest",
    query: `PREFIX dwc: <http://rs.tdwg.org/dwc/terms/>
PREFIX ali: <https://ali-species.org/vocab#>

SELECT ?taxon ?name ?mass WHERE {
  ?taxon a dwc:Taxon ;
         dwc:class "Mammalia" ;
         dwc:scientificName ?name ;
         ali:trait [ ali:key "adultBodyMass" ; ali:numericValue ?mass ] .
}
ORDER BY DESC(?mass)
LIMIT 10`,
  },
  {
    id: "wolf-prey",
    titleKey: "exportPage.sampleWolfPrey",
    query: `PREFIX ro: <http://purl.obolibrary.org/obo/>
PREFIX ali: <https://ali-species.org/vocab#>

SELECT ?prey ?name WHERE {
  ali:taxon-60577 ro:RO_0002439 ?prey .
  ?prey <http://rs.tdwg.org/dwc/terms/scientificName> ?name .
}
LIMIT 30`,
  },
];

export default function ExportPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || "fr";

  const { data: info, isLoading, isError } = useQuery<ExportInfo>({
    queryKey: ["exports-info"],
    queryFn: async () => {
      const r = await fetch("/api/exports/info");
      if (!r.ok) throw new Error("info fetch failed");
      return r.json();
    },
  });

  const { data: sparqlStatus } = useQuery<SparqlStatus>({
    queryKey: ["sparql-status"],
    queryFn: async () => {
      const r = await fetch("/api/sparql/status");
      const j = await r.json();
      return { ...j, loaded: r.ok && j.loaded === true };
    },
    retry: false,
  });
  const sparqlAvailable = sparqlStatus?.loaded === true;

  const ttlSize = info?.ttl?.sizeMb;
  const stats = info?.stats ?? {};

  return (
    <Layout>
      <Helmet>
        <html lang={lang} />
        <title>{t("exportPage.title")}</title>
        <meta name="description" content={t("exportPage.metaDescription")} />
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest bg-primary/10 text-primary mb-3">
            <Database className="w-3 h-3" />
            {t("exportPage.badge")}
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4">
            {t("exportPage.heading")}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t("exportPage.intro")}
          </p>
        </div>

        {/* Téléchargement principal */}
        <section className="mb-10 p-6 rounded-xl border border-border bg-card">
          <h2 className="text-xl font-serif font-semibold mb-2 flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            {t("exportPage.dlHeading")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{t("exportPage.dlDesc")}</p>

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="/api/exports/rdf.ttl.gz"
              download={info?.ttl?.filename ?? "ali-species.ttl.gz"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" />
              {t("exportPage.dlButton")}
              {ttlSize && <span className="text-xs opacity-80">({ttlSize} MB)</span>}
            </a>
            <a
              href="/api/exports/stats.csv"
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
            >
              <FileText className="w-4 h-4" />
              {t("exportPage.dlStats")}
            </a>
          </div>

          {isLoading && (
            <p className="mt-4 text-xs text-muted-foreground">{t("common.loading")}</p>
          )}
          {isError && (
            <p className="mt-4 text-xs text-destructive">{t("exportPage.loadError")}</p>
          )}
          {info?.ttl && (
            <p className="mt-4 text-xs text-muted-foreground">
              {t("exportPage.dlGenerated")} {fmtDate(info.ttl.mtime, lang)} ·{" "}
              <code className="font-mono">{info.ttl.filename}</code>
            </p>
          )}
        </section>

        {/* Statistiques du dump */}
        <section className="mb-10">
          <h2 className="text-xl font-serif font-semibold mb-4 flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" />
            {t("exportPage.statsHeading")}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label={t("exportPage.statTaxons")} value={fmtInt(stats.taxon_count)} />
            <StatCard label={t("exportPage.statStatuses")} value={fmtInt(stats.status_count)} />
            <StatCard label={t("exportPage.statTraits")} value={fmtInt(stats.trait_row_count)} />
            <StatCard label={t("exportPage.statWikidata")} value={fmtInt(stats.wikidata_link_count)} />
            <StatCard label={t("exportPage.statGlobi")} value={fmtInt(stats.globi_link_count)} />
            <StatCard label={t("exportPage.statTriples")} value={fmtInt(stats.triples_emitted)} highlight />
          </div>
        </section>

        {/* SPARQL endpoint */}
        <section className="mb-10 p-6 rounded-xl border border-border bg-muted/20">
          <h2 className="text-xl font-serif font-semibold mb-2 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-primary" />
            {t("exportPage.sparqlHeading")}
          </h2>

          {sparqlAvailable ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">{t("exportPage.sparqlDesc")}</p>
              <ul className="text-sm space-y-1.5 mb-4">
                <li>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/api/sparql</code>{" "}
                  — {t("exportPage.sparqlEndpoint")}
                </li>
                <li>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/api/sparql/ui</code>{" "}
                  —{" "}
                  <a
                    href="/api/sparql/ui"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-dotted hover:text-foreground inline-flex items-center gap-1"
                  >
                    {t("exportPage.sparqlYasgui")}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/api/sparql/status</code>{" "}
                  — {t("exportPage.sparqlStatus")}
                </li>
              </ul>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-foreground hover:text-primary">
                  {t("exportPage.sparqlCurl")}
                </summary>
                <pre className="mt-2 bg-background border border-border rounded p-3 text-[11px] overflow-x-auto">
{`curl -X POST ${typeof window !== "undefined" ? window.location.origin : "https://ali-species.replit.app"}/api/sparql \\
  -H "Content-Type: application/sparql-query" \\
  -H "Accept: application/sparql-results+json" \\
  --data-binary 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10'`}
                </pre>
              </details>
            </>
          ) : (
            <>
              <div className="mb-4 p-3 rounded-lg border border-amber-500/40 bg-amber-50/60 text-amber-900 text-sm">
                <strong className="font-semibold">{t("exportPage.sparqlOfflineTitle")}</strong>{" "}
                {t("exportPage.sparqlOfflineBody")}
              </div>
              <p className="text-sm text-muted-foreground mb-3">{t("exportPage.sparqlLocalIntro")}</p>
              <pre className="bg-background border border-border rounded-lg p-4 text-[11px] overflow-x-auto leading-relaxed">
{`# 1. Installer Oxigraph
brew install oxigraph
# ou: cargo install oxigraph_server

# 2. Télécharger le dump
curl -LO ${typeof window !== "undefined" ? window.location.origin : "https://ali-species.replit.app"}/api/exports/rdf.ttl.gz

# 3. Charger dans un store RocksDB local
oxigraph_server load -l ./store --file ali-species-*.ttl.gz --format ttl

# 4. Lancer l'endpoint SPARQL
oxigraph_server serve -l ./store --bind 127.0.0.1:7878
# → http://127.0.0.1:7878/query`}
              </pre>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("exportPage.sparqlLocalAlts")}
              </p>
            </>
          )}
        </section>

        {/* Schéma & vocabulaires */}
        <section className="mb-10">
          <h2 className="text-xl font-serif font-semibold mb-4">{t("exportPage.schemaHeading")}</h2>
          <p className="text-sm text-muted-foreground mb-3">{t("exportPage.schemaDesc")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {[
              { label: "Darwin Core", url: "https://dwc.tdwg.org/terms/" },
              { label: "SKOS", url: "https://www.w3.org/2004/02/skos/" },
              { label: "OWL", url: "https://www.w3.org/OWL/" },
              { label: "Relations Ontology", url: "https://obofoundry.org/ontology/ro.html" },
              { label: "DCTERMS", url: "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/" },
              { label: "VoID", url: "https://www.w3.org/TR/void/" },
            ].map((v) => (
              <a
                key={v.label}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg border border-border hover:bg-muted/40 transition-colors inline-flex items-center justify-between gap-2"
              >
                <span>{v.label}</span>
                <ExternalLink className="w-3 h-3 opacity-50" />
              </a>
            ))}
          </div>
        </section>

        {/* Exemples de requêtes */}
        <section className="mb-10">
          <h2 className="text-xl font-serif font-semibold mb-4">{t("exportPage.examplesHeading")}</h2>
          <div className="space-y-4">
            {SAMPLE_QUERIES.map((q) => (
              <div key={q.id} className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2 bg-muted/40 border-b border-border text-sm font-medium">
                  {t(q.titleKey)}
                </div>
                <pre className="bg-background p-4 text-[11px] overflow-x-auto leading-relaxed">
                  {q.query}
                </pre>
              </div>
            ))}
          </div>
        </section>

        {/* Licence */}
        <section className="p-5 rounded-xl border border-border bg-muted/20 text-sm">
          <h2 className="text-base font-semibold mb-2">{t("exportPage.licenseHeading")}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t("exportPage.licenseBody")}{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted hover:text-foreground"
            >
              CC-BY 4.0
            </a>
            . {t("exportPage.licenseAttribution")}
          </p>
        </section>
      </div>
    </Layout>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`p-4 rounded-xl border ${
        highlight ? "bg-primary/5 border-primary/30" : "bg-card border-border"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-serif font-bold ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
