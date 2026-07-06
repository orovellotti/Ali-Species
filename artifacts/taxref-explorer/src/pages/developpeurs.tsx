import { Layout } from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Database, Download, ExternalLink, FileText, Network, Code2, Server,
  Sparkles, Copy, Check, Zap,
} from "lucide-react";

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

// Prefer the public canonical domain for copy-paste configs so end users
// (Claude Desktop, Cursor…) get a working URL even from the dev preview.
function getOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (origin.includes("alispecies.io")) return origin;
    if (origin.includes("localhost") || origin.includes(".replit.dev")) {
      return "https://alispecies.io";
    }
    return origin;
  }
  return "https://alispecies.io";
}
const ORIGIN = getOrigin();
const MCP_URL_CANONICAL = `${ORIGIN}/api/mcp`;
const REST_BASE = `${ORIGIN}/api`;

const CLAUDE_DESKTOP_CONFIG = `{
  "mcpServers": {
    "ali-species": {
      "type": "http",
      "url": "${MCP_URL_CANONICAL}"
    }
  }
}`;

const CURSOR_CONFIG = `{
  "mcpServers": {
    "ali-species": {
      "url": "${MCP_URL_CANONICAL}"
    }
  }
}`;

const OPENAI_FUNCTION_EXAMPLE = `import OpenAI from "openai";

const client = new OpenAI();

// Call any ALi Species REST endpoint as a tool from your model
const tools = [{
  type: "function",
  function: {
    name: "search_taxons",
    description: "Search French species (TAXREF v18) by scientific or vernacular name.",
    parameters: {
      type: "object",
      properties: { q: { type: "string" }, limit: { type: "integer" } },
      required: ["q"],
    },
  },
}];

const res = await client.chat.completions.create({
  model: "gpt-4.1-mini",
  messages: [{ role: "user", content: "Liste 5 mésanges protégées en France" }],
  tools,
});

// When the model asks to call search_taxons, hit:
//   GET ${REST_BASE}/taxons/search?q={q}&limit={limit}
`;

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
  {
    id: "eunis-habitats",
    titleKey: "exportPage.sampleEunisHabitats",
    query: `PREFIX dwc: <http://rs.tdwg.org/dwc/terms/>
PREFIX ali: <https://ali-species.org/vocab#>

SELECT ?name ?habitat WHERE {
  ?taxon a dwc:Taxon ;
         dwc:scientificName ?name ;
         ali:eunisPreferredHabitat ?habitat .
}
LIMIT 25`,
  },
];

export default function DeveloppeursPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || "fr";
  const fr = lang === "fr";

  const [mcpCopied, setMcpCopied] = useState(false);
  const mcpUrlLive = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : MCP_URL_CANONICAL;
  const handleCopyMcp = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrlLive);
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 1800);
    } catch {/* ignore */}
  };

  const REST_ENDPOINTS: ReadonlyArray<{ method: string; path: string; key: string }> = [
    { method: "GET", path: "/api/taxons/search?q={query}", key: "search" },
    { method: "GET", path: "/api/taxons/{cdNom}", key: "detail" },
    { method: "GET", path: "/api/taxons/{cdNom}/classification", key: "classification" },
    { method: "GET", path: "/api/taxons/{cdNom}/statuts", key: "statuts" },
    { method: "GET", path: "/api/taxons/{cdNom}/interactions", key: "interactions" },
    { method: "GET", path: "/api/taxons/{cdNom}/traits", key: "traits" },
    { method: "GET", path: "/api/stats", key: "stats" },
    { method: "POST", path: "/api/ask", key: "ask" },
  ];

  const MCP_GROUPS: ReadonlyArray<{ titleKey: string; tools: ReadonlyArray<string> }> = [
    { titleKey: "exportPage.mcpGroupSearch", tools: [
      "search_taxons", "query_taxa", "get_taxon", "get_classification",
      "get_children", "get_parent", "get_synonyms", "get_random_species",
      "list_taxonomic_facets",
    ] },
    { titleKey: "exportPage.mcpGroupStatuts", tools: [
      "get_statuts", "status_breakdown", "list_status_types", "list_territoires",
    ] },
    { titleKey: "exportPage.mcpGroupTraits", tools: [
      "get_global_stats", "query_traits", "get_trait_keys", "get_traits",
    ] },
    { titleKey: "exportPage.mcpGroupEnrich", tools: [
      "get_interactions", "get_wikipedia", "get_gbif", "get_bhl",
      "get_eunis_habitats", "get_habref_habitats",
    ] },
    { titleKey: "exportPage.mcpGroupSparql", tools: [
      "run_sparql",
    ] },
  ];
  const mcpToolCount = MCP_GROUPS.reduce((n, g) => n + g.tools.length, 0);

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
        <title>{fr ? "Développeurs & Open Data — ALI Species" : "Developers & Open Data — ALI Species"}</title>
        <meta
          name="description"
          content={fr
            ? "MCP, API REST, endpoint SPARQL et dump RDF complet — branchez votre IA ou votre code sur la biodiversité française. Open data CC-BY 4.0, sans clé."
            : "MCP, REST API, SPARQL endpoint and full RDF dump — plug your AI or code into French biodiversity. CC-BY 4.0 open data, no key required."}
        />
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            {fr ? "Pour développeurs & agents IA" : "For developers & AI agents"}
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4">
            {fr ? "Développeurs & Open Data" : "Developers & Open Data"}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {fr
              ? "ALI Species expose ses 708 685 taxons, statuts de protection, traits et interactions écologiques via quatre surfaces ouvertes : un serveur MCP, une API REST, un endpoint SPARQL et un dump RDF complet. Tout est public, sans clé."
              : "ALI Species exposes its 708,685 taxa, protection statuses, traits and ecological interactions via four open surfaces: an MCP server, a REST API, a SPARQL endpoint and a full RDF dump. All public, no key required."}
          </p>
        </div>

        {/* Quick endpoints */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-14">
          <EndpointCard icon={<Server className="w-4 h-4" />} label="MCP" url={MCP_URL_CANONICAL} />
          <EndpointCard icon={<Code2 className="w-4 h-4" />} label="REST API" url={REST_BASE} />
          <EndpointCard icon={<Network className="w-4 h-4" />} label="SPARQL" url={`${ORIGIN}/api/sparql`} />
        </div>

        {/* Téléchargement du dump */}
        <section className="mb-10 p-6 rounded-xl border border-border bg-card">
          <h2 className="text-xl font-serif font-semibold mb-2 flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            {t("exportPage.dlHeading")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{t("exportPage.dlDesc")}</p>

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={`${window.location.origin}/api/exports/rdf.ttl.gz`}
              onClick={(e) => {
                e.preventDefault();
                window.open(`${window.location.origin}/api/exports/rdf.ttl.gz`, "_blank", "noopener");
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {t("exportPage.dlButton")}
              {ttlSize && <span className="text-xs opacity-80">({ttlSize} MB)</span>}
            </a>
            <a
              href={`${window.location.origin}/api/exports/stats.csv`}
              onClick={(e) => {
                e.preventDefault();
                window.open(`${window.location.origin}/api/exports/stats.csv`, "_blank", "noopener");
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm cursor-pointer"
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

        {/* Serveur MCP */}
        <section id="mcp" className="mb-10 p-6 rounded-xl border border-primary/30 bg-primary/5 scroll-mt-24">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <Server className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-serif font-semibold">{t("exportPage.mcpHeading")}</h2>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" />
              {t("exportPage.mcpBadge")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{t("exportPage.mcpDesc")}</p>

          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
              {t("exportPage.mcpUrlLabel")}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs sm:text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground overflow-x-auto whitespace-nowrap">
                {mcpUrlLive}
              </code>
              <button
                type="button"
                onClick={handleCopyMcp}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-xs font-medium shrink-0"
              >
                {mcpCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {mcpCopied ? t("exportPage.mcpCopied") : t("exportPage.mcpCopy")}
              </button>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              {t("exportPage.mcpToolsLabel")}{" "}
              <span className="text-muted-foreground/70 normal-case tracking-normal">
                ({mcpToolCount})
              </span>
            </div>
            <div className="space-y-4">
              {MCP_GROUPS.map((group) => (
                <div key={group.titleKey}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1.5">
                    {t(group.titleKey)}
                  </div>
                  <ul className="space-y-1">
                    {group.tools.map((tool) => (
                      <li key={tool} className="text-sm flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                        <code className="font-mono text-xs text-primary bg-background border border-border rounded px-1.5 py-0.5 sm:w-48 shrink-0">
                          {tool}
                        </code>
                        <span className="text-xs text-muted-foreground">
                          {t(`exportPage.mcpTools.${tool}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Client configs */}
          <h3 className="text-base font-semibold text-foreground mt-8 mb-2">
            {fr ? "Configuration Claude Desktop" : "Claude Desktop configuration"}
          </h3>
          <p className="text-sm text-muted-foreground mb-2">
            {fr
              ? "Réglages → Développeur → Modifier la config, puis ajoute :"
              : "Settings → Developer → Edit Config, then add:"}
          </p>
          <CodeBlock code={CLAUDE_DESKTOP_CONFIG} />

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
            {fr ? "Configuration Cursor / Continue / Codex" : "Cursor / Continue / Codex configuration"}
          </h3>
          <p className="text-sm text-muted-foreground mb-2">
            {fr
              ? "Même format général, ajoute le serveur dans la config MCP de ton outil :"
              : "Same general format — add the server in your tool's MCP config:"}
          </p>
          <CodeBlock code={CURSOR_CONFIG} />

          <p className="text-xs text-muted-foreground italic mt-4">{t("exportPage.mcpTransport")}</p>
        </section>

        {/* API REST */}
        <section className="mb-10">
          <h2 className="text-xl font-serif font-semibold mb-2 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-primary" />
            {t("exportPage.restHeading")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{t("exportPage.restDesc")}</p>
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {REST_ENDPOINTS.map((e) => (
              <div key={e.path} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-4 py-2.5 text-sm hover:bg-muted/30">
                <div className="flex items-center gap-2 sm:w-auto">
                  <span className={`inline-block w-12 text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-center ${
                    e.method === "GET" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                  }`}>
                    {e.method}
                  </span>
                  <code className="font-mono text-xs text-foreground">{e.path}</code>
                </div>
                <span className="text-xs text-muted-foreground sm:ml-auto sm:text-right">
                  {t(`exportPage.restEndpoints.${e.key}`)}
                </span>
              </div>
            ))}
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
{`curl -X POST ${typeof window !== "undefined" ? window.location.origin : "https://alispecies.io"}/api/sparql \\
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
curl -LO ${typeof window !== "undefined" ? window.location.origin : "https://alispecies.io"}/api/exports/rdf.ttl.gz

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

        {/* Construire une skill IA */}
        <section id="build-skill" className="mb-10 scroll-mt-24">
          <h2 className="text-xl font-serif font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {fr ? "Construire une skill IA" : "Build an AI skill"}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {fr
              ? "Trois manières simples d'utiliser ALi Species dans ton propre agent ou produit IA."
              : "Three simple ways to use ALi Species in your own agent or AI product."}
          </p>

          {/* Claude */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-orange-100 text-orange-700 text-xs font-bold">C</span>
              Claude (Anthropic)
            </h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>{fr ? "Ouvre Claude Desktop → Réglages → Développeur → Modifier la config" : "Open Claude Desktop → Settings → Developer → Edit Config"}</li>
              <li>{fr ? "Colle la configuration MCP ci-dessus" : "Paste the MCP configuration above"}</li>
              <li>{fr ? "Redémarre Claude — les outils apparaissent dans la barre d'outils" : "Restart Claude — the tools appear in the tool bar"}</li>
              <li>{fr ? "Pour un Project Claude : ajoute des instructions du type « Tu peux interroger ALi Species pour toute question sur la biodiversité française. »" : "For a Claude Project: add instructions like \"You can query ALi Species for any French biodiversity question.\""}</li>
            </ol>
          </div>

          {/* OpenAI */}
          <div className="mt-4 p-5 rounded-xl border border-border bg-card space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100 text-emerald-700 text-xs font-bold">O</span>
              OpenAI (ChatGPT, Assistants, Responses)
            </h3>
            <p className="text-sm text-muted-foreground">
              {fr
                ? "OpenAI ne supporte pas MCP nativement (à date). Deux chemins :"
                : "OpenAI does not natively support MCP (as of today). Two paths:"}
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>
                <strong className="text-foreground">Custom GPT</strong>
                {" — "}{fr
                  ? "crée un GPT, ajoute une Action et décris les endpoints REST listés sur cette page."
                  : "create a GPT, add an Action and describe the REST endpoints listed on this page."}
              </li>
              <li>
                <strong className="text-foreground">Function calling</strong>
                {" — "}{fr ? "déclare chaque endpoint REST comme une fonction outil :" : "declare each REST endpoint as a tool function:"}
              </li>
            </ul>
            <CodeBlock code={OPENAI_FUNCTION_EXAMPLE} />
          </div>

          {/* Generic */}
          <div className="mt-4 p-5 rounded-xl border border-border bg-card space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-100 text-blue-700 text-xs font-bold">*</span>
              {fr ? "Tout autre agent" : "Any other agent"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {fr
                ? "L'API REST est la voie universelle. Tous les endpoints sont documentés dans le schéma OpenAPI public :"
                : "The REST API is the universal path. All endpoints are documented in the public OpenAPI schema:"}
            </p>
            <CodeBlock code={`curl ${REST_BASE}/taxons/search?q=mesange&limit=5`} />
          </div>
        </section>

        {/* Licence */}
        <section className="p-5 rounded-xl border border-border bg-muted/20 text-sm">
          <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            {t("exportPage.licenseHeading")}
          </h2>
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

function EndpointCard({ icon, label, url }: { icon: React.ReactNode; label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all group"
      data-testid={`endpoint-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          {icon} {label}
        </span>
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />}
      </div>
      <code className="block text-xs font-mono text-foreground/80 break-all">{url}</code>
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  }
  return (
    <div className="relative group">
      <pre className="bg-neutral-950 text-neutral-100 text-xs font-mono p-4 rounded-lg overflow-x-auto border border-border">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
