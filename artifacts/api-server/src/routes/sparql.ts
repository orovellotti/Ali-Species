/**
 * SPARQL endpoint — thin HTTP proxy to a local oxigraph_server (RocksDB-backed).
 *
 * Architecture
 * ------------
 * The full RDF dump (17M+ triples) is loaded once via the `oxigraph_server load`
 * CLI into a persistent on-disk RocksDB store at `exports/oxigraph-store/`.
 * A separate `oxigraph_server serve-read-only` workflow then exposes that store
 * over HTTP at OXIGRAPH_HTTP (default 127.0.0.1:7878). This Express route simply
 * forwards SPARQL queries to that server, so we get true disk-backed storage
 * with negligible memory footprint in the api-server process.
 *
 * Implements the SPARQL 1.1 Protocol over HTTP:
 *   GET  /api/sparql?query=...           → forwards to upstream
 *   POST /api/sparql                     → form-urlencoded query=... or sparql-query body
 *
 * Plus a small built-in YASGUI client at /api/sparql/ui.
 */
import { Router, type IRouter } from "express";

const router: IRouter = Router();

const UPSTREAM = process.env.OXIGRAPH_HTTP ?? "http://127.0.0.1:9000";
const STORE_NAME = "ali-species-rocksdb";

interface UpstreamHealth {
  ok: boolean;
  triples?: number;
  error?: string;
}

async function upstreamHealth(): Promise<UpstreamHealth> {
  try {
    // SPARQL HEAD on the query endpoint is the simplest reachability probe.
    const r = await fetch(`${UPSTREAM}/query?query=${encodeURIComponent("ASK { ?s ?p ?o }")}`, {
      headers: { Accept: "application/sparql-results+json" },
    });
    if (!r.ok) return { ok: false, error: `Upstream ${r.status} ${r.statusText}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function countTriples(): Promise<number | undefined> {
  try {
    const r = await fetch(
      `${UPSTREAM}/query?query=${encodeURIComponent("SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }")}`,
      { headers: { Accept: "application/sparql-results+json" } },
    );
    if (!r.ok) return undefined;
    const json = (await r.json()) as {
      results?: { bindings?: Array<{ n?: { value?: string } }> };
    };
    const v = json?.results?.bindings?.[0]?.n?.value;
    return v ? Number(v) : undefined;
  } catch {
    return undefined;
  }
}

async function proxyQuery(query: string, accept: string): Promise<{ status: number; body: string; contentType: string }> {
  const r = await fetch(`${UPSTREAM}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/sparql-query",
      Accept: accept || "application/sparql-results+json",
    },
    body: query,
  });
  const body = await r.text();
  return {
    status: r.status,
    body,
    contentType: r.headers.get("content-type") ?? "application/sparql-results+json",
  };
}

const UNAVAILABLE_MSG =
  "L'endpoint SPARQL public n'est pas disponible dans cet environnement. " +
  "Téléchargez le dump RDF depuis /api/exports/rdf.ttl.gz et lancez Oxigraph en local : " +
  "`oxigraph_server load -l ./store --file ali-species.ttl.gz --format ttl` puis " +
  "`oxigraph_server serve -l ./store --bind 127.0.0.1:7878`. Voir /export pour les détails.";

router.get("/sparql", async (req, res): Promise<void> => {
  const query = (req.query.query ?? req.query.q) as string | undefined;
  if (!query) {
    res.status(400).json({
      error: "Missing query parameter",
      hint: "Use /api/sparql?query=SELECT+%3Fs+WHERE+%7B%3Fs+%3Fp+%3Fo%7D+LIMIT+10  or POST a SPARQL query. See /api/sparql/ui for a visual client.",
    });
    return;
  }
  try {
    const out = await proxyQuery(query, req.get("accept") || "");
    res.status(out.status).setHeader("Content-Type", out.contentType).send(out.body);
  } catch {
    res.status(503).json({ error: "SPARQL endpoint unavailable", hint: UNAVAILABLE_MSG });
  }
});

router.post("/sparql", async (req, res): Promise<void> => {
  let query: string | undefined;
  const ct = req.get("content-type") || "";
  if (ct.includes("application/sparql-query")) {
    query = typeof req.body === "string" ? req.body : (req.body as { toString: () => string })?.toString();
  } else {
    query = (req.body as { query?: string })?.query;
  }
  if (!query) {
    res.status(400).json({ error: "Missing query in request body" });
    return;
  }
  try {
    const out = await proxyQuery(query, req.get("accept") || "");
    res.status(out.status).setHeader("Content-Type", out.contentType).send(out.body);
  } catch {
    res.status(503).json({ error: "SPARQL endpoint unavailable", hint: UNAVAILABLE_MSG });
  }
});

router.get("/sparql/status", async (_req, res): Promise<void> => {
  const h = await upstreamHealth();
  if (!h.ok) {
    res.status(503).json({
      loaded: false,
      upstream: UPSTREAM,
      error:
        h.error +
        " — Make sure the `oxigraph-server` workflow is running. Load the store first with: " +
        "`gunzip -c exports/ali-species-*.ttl.gz | oxigraph_server load -l exports/oxigraph-store --format ttl`",
    });
    return;
  }
  const triples = await countTriples();
  res.json({
    loaded: true,
    upstream: UPSTREAM,
    storeName: STORE_NAME,
    triples,
  });
});

router.get("/sparql/ui", async (_req, res): Promise<void> => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const h = await upstreamHealth();
  if (!h.ok) {
    res.send(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>ALi species — SPARQL endpoint indisponible</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f7f6f1; color: #2c3e50; }
    .wrap { max-width: 720px; margin: 60px auto; padding: 32px; background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
    h1 { margin-top: 0; font-size: 22px; }
    code, pre { background: #f1efe7; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    pre { padding: 12px; overflow-x: auto; line-height: 1.5; }
    a { color: #2c5530; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>SPARQL endpoint non disponible publiquement</h1>
    <p>L'instance Oxigraph n'est pas exposée dans cet environnement (déploiement autoscale sans triplestore).</p>
    <p>L'intégralité du graphe reste téléchargeable au format Turtle : <a href="/api/exports/rdf.ttl.gz">/api/exports/rdf.ttl.gz</a> (~103 Mo, 17M+ triplets).</p>
    <h2 style="font-size:16px">Lancer un endpoint SPARQL local en 30 secondes</h2>
    <pre># 1. Installer Oxigraph (https://github.com/oxigraph/oxigraph)
brew install oxigraph    # ou: cargo install oxigraph_server

# 2. Charger le dump
curl -O https://${"$"}{HOST}/api/exports/rdf.ttl.gz
oxigraph_server load -l ./store --file ali-species-*.ttl.gz --format ttl

# 3. Servir l'endpoint
oxigraph_server serve -l ./store --bind 127.0.0.1:7878
# → SPARQL dispo sur http://127.0.0.1:7878/query</pre>
    <p>Voir <a href="/export">/export</a> pour la documentation complète.</p>
  </div>
</body>
</html>`);
    return;
  }
  res.send(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>ALi species — SPARQL endpoint</title>
  <link rel="stylesheet" href="https://unpkg.com/@triply/yasgui/build/yasgui.min.css">
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    header { background: #2c3e50; color: white; padding: 12px 20px; }
    header h1 { margin: 0; font-size: 18px; }
    header p { margin: 4px 0 0; font-size: 13px; opacity: .8; }
    #yasgui { height: calc(100vh - 90px); }
    a { color: #6cb4ee; }
  </style>
</head>
<body>
  <header>
    <h1>ALi species — SPARQL endpoint</h1>
    <p>
      Endpoint : <code>/api/sparql</code> &middot;
      Status : <code><a href="/api/sparql/status">/api/sparql/status</a></code> &middot;
      Préfixes : dwc, skos, owl, ro, dcterms, void, id, vocab
    </p>
  </header>
  <div id="yasgui"></div>
  <script src="https://unpkg.com/@triply/yasgui/build/yasgui.min.js"></script>
  <script>
    const yasgui = new Yasgui(document.getElementById("yasgui"), {
      requestConfig: { endpoint: "/api/sparql", method: "POST" },
      copyEndpointOnNewTab: true,
    });
    if (yasgui.getTab()) {
      yasgui.getTab().setQuery(\`PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dwc: <http://rs.tdwg.org/dwc/terms/>

# Le loup gris (cd_nom 60577) : libellé + rang
SELECT ?label ?rank WHERE {
  <https://ali-species.app/id/taxon/60577> rdfs:label ?label ;
                                           dwc:taxonRank ?rank .
}\`);
    }
  </script>
</body>
</html>`);
});

export default router;
