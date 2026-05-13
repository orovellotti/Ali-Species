# Linked Open Data — RDF / SPARQL

The full graph (TAXREF v18 + BdC Statuts + traits + Wikidata mappings + GloBI interactions) is exported as gzipped Turtle and served via a SPARQL endpoint backed by **Oxigraph** (RocksDB-on-disk).

## Components

- **Vocabulary lib** (`lib/rdf-vocab`): URI namespaces (`https://ali-species.app/id/`, `…/vocab/`) + DwC, SKOS, OWL, RO, DCTERMS, VOID prefixes; URI builders for taxons, statuts, traits, Wikidata/GloBI links.
- **Cache tables** (`wikidata_cache`, `globi_cache`): `cd_nom` PK + `payload` jsonb + `fetched_at`, used by the materialisation scripts and read by the RDF export.
- **Streaming dump CLI** (`scripts/src/rdf-export.ts`): pulls every taxon, statut, trait and pre-materialised Wikidata/GloBI row through pg cursors, serialises with N3 + manual gzip backpressure, writes to `exports/ali-species-<git-sha>.ttl.gz` (~103 MB compressed, **17.27M triples**) plus a stats CSV.
- **Pre-materialisation** (`materialize-wikidata.ts`, `materialize-globi.ts`): batched fetch (50/req for Wikidata SPARQL, per-cd_nom for GloBI) into the cache tables, resumable by skipping rows fresher than 30 days. Long-running (~24h end-to-end) but only needed once per refresh.

## SPARQL endpoint architecture

- `oxigraph-server` workflow runs `oxigraph_server serve-read-only -l exports/oxigraph-store --bind 0.0.0.0:9000` (read-only, disk-backed, ~MB-level RAM).
- `artifacts/api-server/src/routes/sparql.ts` is a thin proxy: `GET/POST /api/sparql` forwards to the Oxigraph upstream (`OXIGRAPH_HTTP`, default `http://127.0.0.1:9000`); `GET /api/sparql/status` reports triple count; `GET /api/sparql/ui` ships a YASGUI client.
- The in-process `oxigraph` npm package was removed: 17M triples blow the WASM 4 GiB linear-memory cap, so loading must happen in the native Rust binary.

## Refresh runbook (re-loading the store after a new dump)

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

## Public download endpoints

`artifacts/api-server/src/routes/exports.ts` autodiscovers the latest `ali-species-<sha>.ttl.gz` in `exports/`, couples stats CSV by shared `<sha>` prefix, streams with proper `Content-Length` + error handling. No user-supplied filename → no path-traversal vector.

## Autoscale-aware degradation

SPARQL routes (`/api/sparql`, `/api/sparql/ui`) detect Oxigraph reachability and return a clean 503 / instructions page when the triplestore isn't running (the case in the published autoscale deployment, since `oxigraph-server` is a separate dev-only workflow). The `/export` page mirrors this on the frontend.

## Iframe-safe download trigger

The `/export` download buttons use a programmatic `window.open(absoluteUrl, "_blank", "noopener")` from a click handler instead of an `<a href download target=_top>`. Reason: when the app is viewed inside the Replit canvas wrapper iframe (`__replco/workspace_iframe.html`), `<a>` link navigation toward a binary gets intercepted/aborted by the wrapper after ~200 ms, producing 0-byte files. `window.open` creates a fresh top-level browsing context that bypasses the wrapper entirely. Server still sets `Content-Disposition: attachment` so the new tab triggers a download and closes itself.

## License

CC-BY 4.0. The Sources and `/export` pages document the dataset and link to `/api/sparql/ui`.
