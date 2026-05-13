# Frontend, UX & Layout

## Frontend Pages

- `/` — Home page with search bar, statistics, interactive taxonomy treemap (5-level drill-down: règnes→embranchements→classes→ordres→familles), and featured kingdoms (Animalia/183716, Plantae/187079, Fungi/187496)
- `/taxonomie` — Conservation statuses browser
- `/sources` — Data sources page with citations and links to RDF/SPARQL section
- `/export` — **RDF/SPARQL documentation page** with TTL dump download button, live graph stats (taxa/statuses/triples counters from `/api/exports/info`), endpoint section that conditionally renders YASGUI link **or** local Oxigraph setup instructions based on `/api/sparql/status`, vocabulary list, sample SPARQL queries, and CC-BY 4.0 license
- `/ai-agents` — **Developer / AI agent hub** : doc consolidée MCP (URL + 22 tools groupés en 5 familles + configs Claude Desktop/Cursor copy-pastable) + RDF/SPARQL (download TTL gz, endpoint, YASGUI, vocabulaires, exemple de requête) + guides "construire une skill IA" pour Claude (MCP), OpenAI (Custom GPT via OpenAPI + function calling avec snippet TS) et tout autre agent (REST). Trois cards endpoint en haut (MCP/REST/SPARQL) avec copy-to-clipboard. Remplace l'ancienne ancre `/export#mcp`.
- `/a-propos` — About page with PatriNat and Natural Solutions credits and MCP integration card
- `/taxon/:slug` — Taxon detail page (SEO-friendly URLs like `/taxon/61098-capra-ibex`); supports old `/taxon/:cdNom` format via `parseCdNomFromParam()`

## URL Construction (linking to species)

```
https://alispecies.io/taxon/{cd_nom}-{slug}    ← format canonique
https://alispecies.io/taxon/{cd_nom}           ← format court (toujours OK)
https://alispecies.io/share/taxon/{cd_nom}     ← preview riche LinkedIn/Slack/X
https://alispecies.io/api/og/taxon/{cd_nom}.png ← image OG seule
```

Le `slug` vient de `slugify(lb_nom)` dans `artifacts/taxref-explorer/src/lib/constants.ts` : NFD → strip diacritiques → lowercase → `[^a-z0-9]+` remplacés par `-` → trim. Le serveur ne lit que le préfixe numérique, le slug est purement cosmétique.

## UX Features (Taxon Page)

- **Species dashboard**: Sensitivity score + driver badges displayed prominently near title. `computeSensitivity()` émet une pastille par (cdTypeStatut × territoire) — "LRN EN", "LRR EN", "PN/PR/PD/POM", "DH/DO" nommées, "ZNIEFF (territoire)", "PNA/exPNA" — avec tooltips détaillées.
- **Image lightbox**: Click-to-zoom with fullscreen overlay (X to close)
- **Sticky image column**: Right sidebar stays visible while scrolling
- **SEO**: react-helmet-async with title/meta/OG/Twitter/JSON-LD structured data per page; static `index.html` fallback contains French meta description, Open Graph, Twitter Card, and JSON-LD `WebSite` + `SearchAction` for crawlers and social previews. Robots meta = `index, follow, max-image-preview:large, max-snippet:-1`. `hreflang` alternates fr/en/x-default. Static `public/robots.txt` (allow all + explicit allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended ; disallow `/api/` ; pointe vers les 3 sitemaps). **Sitemap index** : `public/sitemap.xml` est un `<sitemapindex>` qui référence (1) `public/sitemap-core.xml` (pages principales + 4 taxons featured) et (2) `/api/sitemap-taxa.xml` — endpoint dynamique côté API server qui sert jusqu'à 10 000 fiches espèces (rang=ES, cd_nom=cd_ref) triées par présence de nom vernaculaire puis cd_nom, cached 24 h en mémoire. Note : sur le domaine de preview `*.replit.dev`, Replit ajoute automatiquement `X-Robots-Tag: noindex` — ce header disparaît en production sur le custom domain alispecies.io.
- **Visual hierarchy**: UICN badge color-coded, tags with borders and icons, Wikipedia inline, taxonomy collapsed by default
- **External links**: INPN + GBIF side by side below image

## Layout & Responsive

- **Header** (`components/Layout.tsx`): logo + tagline (tagline hidden < sm), full nav inline ≥ lg, **burger menu** (Lucide `Menu`/`X`) below lg with backdrop-blur overlay, body-scroll lock when open, auto-close on `wouter` location change, full ARIA (`aria-expanded`, `aria-controls`, `aria-label`).
- **Footer**: logo strip + bottom links use `flex-wrap` so they reflow cleanly on small screens.
- **ConversationalBar suggestions**: 3 query-type groups (Simple / Complex / Advanced) shown side-by-side in a `grid-cols-1 md:grid-cols-3` layout with colored dot per level (emerald/amber/rose). All examples are click-to-prefill. Bilingual (FR/EN) via `conversational.suggestions` i18n keys. Réponses chat rendues via `react-markdown` + `remark-gfm` (gras, listes, liens), avec linkification des espèces préservée à l'intérieur des nodes.
