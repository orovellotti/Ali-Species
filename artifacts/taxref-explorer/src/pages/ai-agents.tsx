import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Server, Network, Sparkles, Copy, Check, Download, ExternalLink, Code2, Zap } from "lucide-react";

function getOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    // On preview/dev, prefer the public canonical domain so copy-pasted
    // configs work for end users (Claude Desktop etc.).
    if (origin.includes("alispecies.io")) return origin;
    if (origin.includes("localhost") || origin.includes(".replit.dev")) {
      return "https://alispecies.io";
    }
    return origin;
  }
  return "https://alispecies.io";
}
const ORIGIN = getOrigin();
const MCP_URL = `${ORIGIN}/api/mcp`;
const SPARQL_URL = `${ORIGIN}/api/sparql`;
const REST_BASE = `${ORIGIN}/api`;
const RDF_DUMP = `${ORIGIN}/api/exports/rdf.ttl.gz`;
const YASGUI_URL = `${ORIGIN}/api/sparql/ui`;

const MCP_TOOLS: Array<{ family: string; tools: string[] }> = [
  {
    family: "Search & navigation",
    tools: [
      "search_taxons", "query_taxa", "get_taxon", "get_classification",
      "get_children", "get_parent", "get_synonyms", "get_random_species",
      "list_taxonomic_facets",
    ],
  },
  {
    family: "Conservation statuses",
    tools: ["get_statuts", "status_breakdown", "list_status_types", "list_territoires"],
  },
  {
    family: "Stats & traits",
    tools: ["get_global_stats", "query_traits", "get_trait_keys", "get_traits"],
  },
  {
    family: "External enrichments",
    tools: ["get_interactions", "get_wikipedia", "get_gbif", "get_bhl"],
  },
  { family: "SPARQL", tools: ["run_sparql"] },
];

const CLAUDE_DESKTOP_CONFIG = `{
  "mcpServers": {
    "ali-species": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`;

const CURSOR_CONFIG = `{
  "mcpServers": {
    "ali-species": {
      "url": "${MCP_URL}"
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

const SPARQL_EXAMPLE = `PREFIX dwc: <http://rs.tdwg.org/dwc/terms/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX ali: <https://ali-species.app/vocab/>

# Top 10 protected birds with the largest wing length (AVONET)
SELECT ?taxon ?name ?wing WHERE {
  ?taxon a dwc:Taxon ;
         dwc:scientificName ?name ;
         ali:trait/ali:wingLength ?wing ;
         ali:hasStatus/ali:statusType "PN" .
}
ORDER BY DESC(?wing)
LIMIT 10`;

export default function AiAgentsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || "fr";
  const fr = lang === "fr";

  return (
    <Layout>
      <Helmet>
        <html lang={lang} />
        <title>{t("aiAgents.title")}</title>
        <meta name="description" content={t("aiAgents.metaDescription")} />
        <meta property="og:title" content={t("aiAgents.title")} />
        <meta property="og:description" content={t("aiAgents.metaDescription")} />
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            {fr ? "Pour développeurs et agents IA" : "For developers & AI agents"}
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4">
            {fr ? "Branchez votre IA sur la biodiversité française" : "Plug your AI into French biodiversity"}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {fr
              ? "ALI Species expose ses 708 685 taxons, statuts de protection et interactions écologiques via trois surfaces ouvertes : un serveur MCP, une API REST et un endpoint SPARQL. Tout est public, sans clé."
              : "ALI Species exposes its 708,685 taxa, protection statuses and ecological interactions via three open surfaces: an MCP server, a REST API and a SPARQL endpoint. All public, no key required."}
          </p>
        </div>

        {/* Quick endpoints */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-16">
          <EndpointCard icon={<Server className="w-4 h-4" />} label="MCP" url={MCP_URL} />
          <EndpointCard icon={<Code2 className="w-4 h-4" />} label="REST API" url={REST_BASE} />
          <EndpointCard icon={<Network className="w-4 h-4" />} label="SPARQL" url={SPARQL_URL} />
        </div>

        {/* MCP Section */}
        <Section
          id="mcp"
          icon={<Server className="w-5 h-5" />}
          title={fr ? "Serveur MCP — 22 outils typés" : "MCP server — 22 typed tools"}
        >
          <p>
            {fr
              ? "Le Model Context Protocol (MCP) est un standard qui laisse un assistant IA appeler directement les outils de ce site. Pas de copier-coller depuis un navigateur, l'IA interroge la base à ta place."
              : "The Model Context Protocol (MCP) is a standard that lets an AI assistant call this site's tools directly. No copy-pasting from a browser — the AI queries the database for you."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-6">
            <KV label={fr ? "URL du serveur" : "Server URL"} value={MCP_URL} />
            <KV label="Transport" value="HTTP Streamable" />
            <KV label={fr ? "Auth" : "Auth"} value={fr ? "Aucune (public)" : "None (public)"} />
            <KV label="Version" value="1.4.0" />
          </div>

          <h3 className="text-lg font-semibold text-foreground mt-8 mb-3">
            {fr ? "Outils disponibles" : "Available tools"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {MCP_TOOLS.map((g) => (
              <div key={g.family} className="p-4 rounded-lg border border-border bg-card">
                <div className="text-xs font-bold uppercase tracking-wider text-primary mb-2">{g.family}</div>
                <ul className="text-xs font-mono text-muted-foreground leading-relaxed space-y-0.5">
                  {g.tools.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            ))}
          </div>

          <h3 className="text-lg font-semibold text-foreground mt-8 mb-3">
            {fr ? "Configuration Claude Desktop" : "Claude Desktop configuration"}
          </h3>
          <p className="text-sm text-muted-foreground mb-2">
            {fr
              ? "Édite le fichier de configuration Claude Desktop (Réglages → Développeur → Modifier la config) et ajoute :"
              : "Edit the Claude Desktop configuration file (Settings → Developer → Edit Config) and add:"}
          </p>
          <CodeBlock code={CLAUDE_DESKTOP_CONFIG} />

          <h3 className="text-lg font-semibold text-foreground mt-8 mb-3">
            {fr ? "Configuration Cursor / Continue / Codex" : "Cursor / Continue / Codex configuration"}
          </h3>
          <p className="text-sm text-muted-foreground mb-2">
            {fr
              ? "Même format général, ajoute le serveur dans la configuration MCP de ton outil :"
              : "Same general format — add the server in your tool's MCP configuration:"}
          </p>
          <CodeBlock code={CURSOR_CONFIG} />

          <p className="text-xs text-muted-foreground mt-4">
            {fr ? "Aucune clé n'est requise. Le serveur ne stocke aucune donnée utilisateur." : "No key required. The server does not store any user data."}
          </p>
        </Section>

        {/* RDF / SPARQL Section */}
        <Section
          id="rdf"
          icon={<Network className="w-5 h-5" />}
          title={fr ? "RDF & SPARQL — graphe complet" : "RDF & SPARQL — full graph"}
        >
          <p>
            {fr
              ? "Le graphe complet (TAXREF v18 + BdC Statuts + traits + mappings Wikidata + interactions GloBI) est servi en Turtle gzippé et via un endpoint SPARQL 1.1 propulsé par Oxigraph."
              : "The full graph (TAXREF v18 + BdC Statuses + traits + Wikidata mappings + GloBI interactions) is served as gzipped Turtle and via a SPARQL 1.1 endpoint backed by Oxigraph."}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6">
            <Stat value="708 685" label={fr ? "taxons" : "taxa"} />
            <Stat value="447 664" label={fr ? "statuts" : "statuses"} />
            <Stat value="17,27 M" label={fr ? "triples" : "triples"} />
            <Stat value="~103 MB" label={fr ? "dump gzippé" : "gzipped dump"} />
          </div>

          <div className="flex flex-wrap gap-3 my-6">
            <a
              href={RDF_DUMP}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              data-testid="link-rdf-download"
            >
              <Download className="w-4 h-4" />
              {fr ? "Télécharger le dump Turtle" : "Download Turtle dump"}
            </a>
            <a
              href={YASGUI_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border hover:bg-muted transition-colors text-foreground font-medium"
              data-testid="link-yasgui"
            >
              <ExternalLink className="w-4 h-4" />
              {fr ? "Console SPARQL (YASGUI)" : "SPARQL console (YASGUI)"}
            </a>
          </div>

          <h3 className="text-lg font-semibold text-foreground mt-8 mb-3">
            {fr ? "Vocabulaires utilisés" : "Vocabularies used"}
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
            <li><code className="font-mono text-xs">dwc:</code> Darwin Core (TDWG)</li>
            <li><code className="font-mono text-xs">skos:</code> SKOS (vernaculaires, alt labels)</li>
            <li><code className="font-mono text-xs">owl:sameAs</code> {fr ? "vers Wikidata, GBIF, INPN" : "to Wikidata, GBIF, INPN"}</li>
            <li><code className="font-mono text-xs">ro:</code> Relations Ontology (interactions GloBI)</li>
            <li><code className="font-mono text-xs">ali:</code> {fr ? "vocab. spécifique (statuts BdC, traits)" : "site-specific (BdC statuses, traits)"}</li>
          </ul>

          <h3 className="text-lg font-semibold text-foreground mt-8 mb-3">
            {fr ? "Exemple de requête SPARQL" : "SPARQL query example"}
          </h3>
          <CodeBlock code={SPARQL_EXAMPLE} />

          <p className="text-xs text-muted-foreground mt-4">
            {fr ? "Licence : CC-BY 4.0 — citation requise." : "License: CC-BY 4.0 — attribution required."}
          </p>
        </Section>

        {/* Build a skill */}
        <Section
          id="build-skill"
          icon={<Zap className="w-5 h-5" />}
          title={fr ? "Construire une skill IA" : "Build an AI skill"}
        >
          <p>
            {fr
              ? "Trois manières simples d'utiliser ALi Species dans ton propre agent ou produit IA."
              : "Three simple ways to use ALi Species in your own agent or AI product."}
          </p>

          {/* Claude */}
          <div className="mt-6 p-5 rounded-xl border border-border bg-card space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-orange-100 text-orange-700 text-xs font-bold">C</span>
              Claude (Anthropic)
            </h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>{fr ? "Ouvre Claude Desktop → Réglages → Développeur → Modifier la config" : "Open Claude Desktop → Settings → Developer → Edit Config"}</li>
              <li>{fr ? "Colle la configuration MCP ci-dessus" : "Paste the MCP configuration above"}</li>
              <li>{fr ? "Redémarre Claude — les 22 outils apparaissent dans la barre d'outils" : "Restart Claude — the 22 tools appear in the tool bar"}</li>
              <li>{fr ? "Pour un Project Claude : ajoute des instructions du type \"Tu peux interroger ALi Species pour toute question sur la biodiversité française.\"" : "For a Claude Project: add instructions like \"You can query ALi Species for any French biodiversity question.\""}</li>
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
                  ? "crée un GPT, ajoute une Action et décris les endpoints REST listés sur cette page (la spec OpenAPI complète est dans le repo open source)."
                  : "create a GPT, add an Action and describe the REST endpoints listed on this page (the full OpenAPI spec lives in the open-source repo)."}
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
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-100 text-blue-700 text-xs font-bold">∗</span>
              {fr ? "Tout autre agent" : "Any other agent"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {fr
                ? "L'API REST est la voie universelle. Tous les endpoints sont documentés dans le schéma OpenAPI public :"
                : "The REST API is the universal path. All endpoints are documented in the public OpenAPI schema:"}
            </p>
            <CodeBlock code={`curl ${REST_BASE}/taxons/search?q=mesange&limit=5`} />
          </div>
        </Section>

        {/* Footer / Contact */}
        <div className="mt-16 p-8 rounded-2xl bg-primary/5 border border-primary/20 text-center space-y-3">
          <h2 className="text-xl font-serif font-semibold text-foreground">
            {fr ? "Une question, un projet ?" : "Question, project?"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            {fr
              ? "ALI Species est open source et maintenu par Natural Solutions. Pour collaborer, intégrer le MCP dans ton produit, ou demander un endpoint dédié, écris-nous."
              : "ALI Species is open source and maintained by Natural Solutions. To collaborate, embed the MCP in your product, or request a dedicated endpoint, get in touch."}
          </p>
          <a
            href="https://www.natural-solutions.eu/contact"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            {fr ? "Nous contacter" : "Contact us"}
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </Layout>
  );
}

// ---------- Helpers ----------------------------------------------------

function Section({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-16 scroll-mt-20">
      <h2 className="flex items-center gap-3 text-2xl md:text-3xl font-serif font-semibold text-foreground mb-5">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        {title}
      </h2>
      <div className="text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
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

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border border-border bg-card">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{label}</div>
      <code className="text-xs font-mono text-foreground break-all">{value}</code>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-3 rounded-lg border border-border bg-card text-center">
      <div className="text-xl font-bold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
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
