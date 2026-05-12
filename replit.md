# Workspace

## Overview

ALi species - A web application for browsing the French national taxonomic reference (TAXREF v18) with autocomplete search and taxon images from Wikipedia.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Routing**: wouter (frontend), Express (backend)

## Architecture

### Data Pipeline
- TAXREF v18 data (708,685 taxa) imported from TSV file into PostgreSQL
- BDC Statuts v18 (447,664 conservation statuts) imported from CSV into PostgreSQL
- Import script: `scripts/src/import-taxref.ts`
- Source data: `data/TAXREFv18.txt`, `data/bdc_18_01.csv`
- Trigram indexes (pg_trgm) for fast ILIKE search

### API Endpoints
- `GET /api/taxons/search?q=...&regne=...&limit=...` — Autocomplete search by scientific or vernacular name
- `GET /api/taxons/:cdNom` — Get full taxon details
- `GET /api/taxons/:cdNom/children` — Get subordinate taxa
- `GET /api/taxons/:cdNom/classification` — Get classification hierarchy (breadcrumbs)
- `GET /api/taxons/:cdNom/media` — Get images from Wikipedia/Wikimedia Commons
- `GET /api/taxons/:cdNom/statuts` — Get BDC conservation statuts (Liste rouge, Protection, Directives, Conventions, etc.)
- `GET /api/taxons/:cdNom/wikipedia` — Get Wikipedia FR extract (with EN fallback)
- `GET /api/taxons/:cdNom/gbif` — Get GBIF data (occurrence count, IUCN Red List status)
- `GET /api/taxons/:cdNom/bhl` — Get Biodiversity Heritage Library references (historical publications, cached 30 days in `bhl_cache` table; requires `BHL_API_KEY`, returns 503 with explanation when unset)
- `GET /api/taxons/stats` — Get database statistics
- `GET /api/taxons/taxonomy-tree` — Get 5-level taxonomy tree (règnes→phyla→classes→ordres→familles) for treemap visualization
- `GET /api/taxons/random` — Get a random species taxon
- `GET /api/taxons/:cdNom/traits` — Merged trait payload (DB-cached static sources + live Wikidata)
- `GET /api/taxons/:cdNom/interactions` — GloBI biotic interactions (eats / eaten by / parasite of / etc.)
- `POST /api/ask` — Natural-language agent (LLM-backed) that composes queries against `query_taxons`, `query_traits`, `get_taxon`, `get_statuts`, `get_interactions`, `get_traits`, `get_wikipedia`, `get_gbif` tools
- `GET /api/mcp` — MCP server endpoint (v1.4.0) exposing **22 tools** to AI assistants (Claude, Cursor, ChatGPT…), grouped in 5 families: search/navigation (search_taxons, query_taxa, get_taxon, get_classification, get_children, get_parent, get_synonyms, get_random_species, list_taxonomic_facets), statuses (get_statuts, status_breakdown, list_status_types, list_territoires), stats & traits (get_global_stats, query_traits, get_trait_keys, get_traits), external enrichments (get_interactions, get_wikipedia, get_gbif, get_bhl), and SPARQL (run_sparql proxied to Oxigraph upstream with clear degradation message when the triplestore is unavailable in autoscale prod).
- `GET /api/sparql` (and `POST`) — SPARQL 1.1 endpoint, proxied to Oxigraph; returns **503 with local-setup hint** when Oxigraph is unavailable (e.g. in autoscale prod)
- `GET /api/sparql/ui` — YASGUI SPARQL client; auto-falls back to a static "run Oxigraph locally" instructions page when upstream is down
- `GET /api/sparql/status` — Triplestore reachability + triple count
- `GET /api/exports/info` — JSON metadata about the latest RDF dump (filename, size, mtime, parsed stats CSV)
- `GET /api/exports/rdf.ttl.gz` — Latest gzipped Turtle dump (~103 MB, 17.27M triples). En **dev** : streamé localement depuis `exports/`. En **prod** (NODE_ENV=production) : **302 redirect vers une URL signée GCS** (15 min) — bypass de la limite Cloud Run de 32 MB. Fichier hébergé dans le bucket Replit Object Storage sous `public/exports/`. Re-upload via le snippet `code_execution` dans `docs/ARCHITECTURE.md` après chaque rebuild du dump.
- `GET /api/exports/stats.csv` — Streams the stats CSV coupled to the same dump (shared `<sha>` prefix)

### Frontend Pages
- `/` — Home page with search bar, statistics, interactive taxonomy treemap (5-level drill-down: règnes→embranchements→classes→ordres→familles), and featured kingdoms (Animalia/183716, Plantae/187079, Fungi/187496)
- `/taxonomie` — Conservation statuses browser
- `/sources` — Data sources page with citations and links to RDF/SPARQL section
- `/export` — **RDF/SPARQL documentation page** with TTL dump download button, live graph stats (taxa/statuses/triples counters from `/api/exports/info`), endpoint section that conditionally renders YASGUI link **or** local Oxigraph setup instructions based on `/api/sparql/status`, vocabulary list, sample SPARQL queries, and CC-BY 4.0 license
- `/a-propos` — About page with PatriNat and Natural Solutions credits and MCP integration card
- `/taxon/:slug` — Taxon detail page (SEO-friendly URLs like `/taxon/61098-capra-ibex`); supports old `/taxon/:cdNom` format via `parseCdNomFromParam()`

### UX Features (Taxon Page)
- **Species dashboard**: Sensitivity score + driver badges displayed prominently near title
- **Image lightbox**: Click-to-zoom with fullscreen overlay (X to close)
- **Sticky image column**: Right sidebar stays visible while scrolling
- **SEO**: react-helmet-async with title/meta/OG/Twitter/JSON-LD structured data
- **Visual hierarchy**: UICN badge color-coded, tags with borders and icons, Wikipedia inline, taxonomy collapsed by default
- **External links**: INPN + GBIF side by side below image

### External APIs
- **Wikipedia REST API** — FR/EN page summaries for taxon descriptions (`/api/rest_v1/page/summary/`)
- **Wikipedia/Wikimedia Commons** — Taxon images (fallback chain)
- **GBIF Species API** — Species matching, occurrence counts, IUCN Red List categories
- **Biodiversity Heritage Library (BHL)** — Historical publication references via `op=PublicationSearch` (requires `BHL_API_KEY`, free at https://www.biodiversitylibrary.org/getapikey.aspx). Cached per cd_nom 30 days in `bhl_cache` table.
- Note: TAXREF LD (MNHN) is unavailable due to cyberattack since summer 2025

### Linked Open Data — RDF / SPARQL
The full graph (TAXREF v18 + BdC Statuts + traits + Wikidata mappings + GloBI interactions) is exported as gzipped Turtle and served via a SPARQL endpoint backed by **Oxigraph** (RocksDB-on-disk).

- **Vocabulary lib** (`lib/rdf-vocab`): URI namespaces (`https://ali-species.app/id/`, `…/vocab/`) + DwC, SKOS, OWL, RO, DCTERMS, VOID prefixes; URI builders for taxons, statuts, traits, Wikidata/GloBI links.
- **Cache tables** (`wikidata_cache`, `globi_cache`): `cd_nom` PK + `payload` jsonb + `fetched_at`, used by the materialisation scripts and read by the RDF export.
- **Streaming dump CLI** (`scripts/src/rdf-export.ts`): pulls every taxon, statut, trait and pre-materialised Wikidata/GloBI row through pg cursors, serialises with N3 + manual gzip backpressure, writes to `exports/ali-species-<git-sha>.ttl.gz` (~103 MB compressed, **17.27M triples**) plus a stats CSV.
- **Pre-materialisation** (`materialize-wikidata.ts`, `materialize-globi.ts`): batched fetch (50/req for Wikidata SPARQL, per-cd_nom for GloBI) into the cache tables, resumable by skipping rows fresher than 30 days. Long-running (~24h end-to-end) but only needed once per refresh.
- **SPARQL endpoint architecture**:
  - `oxigraph-server` workflow runs `oxigraph_server serve-read-only -l exports/oxigraph-store --bind 0.0.0.0:9000` (read-only, disk-backed, ~MB-level RAM).
  - `artifacts/api-server/src/routes/sparql.ts` is a thin proxy: `GET/POST /api/sparql` forwards to the Oxigraph upstream (`OXIGRAPH_HTTP`, default `http://127.0.0.1:9000`); `GET /api/sparql/status` reports triple count; `GET /api/sparql/ui` ships a YASGUI client.
  - The in-process `oxigraph` npm package was removed: 17M triples blow the WASM 4 GiB linear-memory cap, so loading must happen in the native Rust binary.
- **Refresh runbook** (re-loading the store after a new dump):
  1. Stop the `oxigraph-server` workflow — `serve-read-only` keeps the RocksDB open and the loader needs a writable handle.
  2. Load into a fresh directory (atomic swap, avoids half-written stores on crash):
     ```sh
     rm -rf exports/oxigraph-store.new
     gunzip -c exports/ali-species-<sha>.ttl.gz \
       | oxigraph_server load -l exports/oxigraph-store.new --format ttl
     mv exports/oxigraph-store exports/oxigraph-store.old
     mv exports/oxigraph-store.new exports/oxigraph-store
     rm -rf exports/oxigraph-store.old
     ```
  3. Restart the `oxigraph-server` workflow.
- **Public download endpoints** (`artifacts/api-server/src/routes/exports.ts`): autodiscover the latest `ali-species-<sha>.ttl.gz` in `exports/`, couple stats CSV by shared `<sha>` prefix, stream with proper `Content-Length` + error handling. No user-supplied filename → no path-traversal vector.
- **Autoscale-aware degradation**: SPARQL routes (`/api/sparql`, `/api/sparql/ui`) detect Oxigraph reachability and return a clean 503 / instructions page when the triplestore isn't running (the case in the published autoscale deployment, since `oxigraph-server` is a separate dev-only workflow). The `/export` page mirrors this on the frontend.
- **Iframe-safe download trigger**: the `/export` download buttons use a programmatic `window.open(absoluteUrl, "_blank", "noopener")` from a click handler instead of an `<a href download target=_top>`. Reason: when the app is viewed inside the Replit canvas wrapper iframe (`__replco/workspace_iframe.html`), `<a>` link navigation toward a binary gets intercepted/aborted by the wrapper after ~200 ms, producing 0-byte files. `window.open` creates a fresh top-level browsing context that bypasses the wrapper entirely. Server still sets `Content-Disposition: attachment` so the new tab triggers a download and closes itself.
- **License**: CC-BY 4.0. The Sources and `/export` pages document the dataset and link to `/api/sparql/ui`.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run import-taxref` — import TAXREF data into DB
- `pnpm --filter @workspace/scripts run ingest-pantheria` — ingest PanTHERIA mammal traits
- `pnpm --filter @workspace/scripts run ingest-avonet` — ingest AVONET bird traits
- `pnpm --filter @workspace/scripts run ingest-amphibio` — ingest AmphiBIO amphibian traits
- `pnpm --filter @workspace/scripts run rdf-export` — generate gzipped Turtle dump in `exports/ali-species-<sha>.ttl.gz`
- `pnpm --filter @workspace/scripts run materialize-wikidata` — pre-fetch Wikidata mappings for every taxon (long-running, batched 50/req)
- `pnpm --filter @workspace/scripts run materialize-globi` — pre-fetch GloBI biotic interactions per taxon (long-running)

## Trait Sources (Static, DB-cached)

The `species_traits` table (PK = `cd_nom` + `source`) caches per-species traits from open scientific datasets, joined to TAXREF by case-insensitive `lb_nom` and restricted by `classe`. The `/api/taxons/:cdNom/traits` endpoint merges these with live Wikidata data and returns `staticSources[]` alongside `traits[]`. Wikidata failures degrade gracefully (the panel still renders DB sources). Sources currently active:

- **PanTHERIA** (Mammalia, ~466 species, 18-trait blocks) — Jones et al. 2009, Ecological Archives E090-184.
- **AVONET** (Aves, ~1865 species, 17-trait blocks) — Tobias et al. 2022, Ecology Letters 25:581-597, CC-BY 4.0.
- **AmphiBIO** (Amphibia, ~193 species, 14-trait blocks) — Oliveira et al. 2017, Scientific Data 4:170123, CC-BY 4.0.
- **SquamBase** — registered in source registry; data ingestion pending an open download URL for the Wiley supplementary materials.

The merged trait payload is also exposed to MCP clients via the `get_traits` tool (alongside `get_taxon`, `get_statuts`, `get_interactions`, `get_wikipedia`, `get_gbif`, etc.) — **21 tools total** on the MCP server (`/api/mcp`, v1.3.0). For trait-based discovery, MCP clients can also call `query_traits` (e.g. mammals heavier than 100 kg → source=pantheria, traitKey=adultBodyMass, minValue=100000) after listing available trait keys with `get_trait_keys`.

## Database Schema

### taxons table
- `cd_nom` (int, PK) — TAXREF identifier
- `cd_ref` (int) — Reference taxon identifier
- `cd_sup` (int, nullable) — Parent taxon identifier
- `regne`, `phylum`, `classe`, `ordre`, `famille` — Classification
- `group1_inpn`, `group2_inpn`, `group3_inpn` — INPN groupings
- `rang` — Taxonomic rank code (KD, PH, CL, OR, FM, GN, ES, SSES, etc.)
- `lb_nom` — Scientific name
- `lb_auteur` — Author citation
- `nom_complet`, `nom_valide` — Complete/valid names
- `nom_vern`, `nom_vern_eng` — Vernacular names (FR/EN)
- `habitat`, `fr`, `url` — Additional metadata

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
