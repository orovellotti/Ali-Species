# ALi Species

A **biodiversity knowledge graph** for France, built on the taxonomic reference **TAXREF v18** (~708,000 species): search, BdC conservation statuses, biological traits, trophic interactions, conversational agent, MCP and SPARQL.

**Production**: <https://alispecies.io>

Built by [Natural Solutions](https://www.natural-solutions.eu/).

---

## What it is

ALi Species is a **biodiversity knowledge graph**: instead of keeping each dataset in its own silo, it connects species, their conservation statuses, their traits, and their ecological interactions into a single, navigable graph. Every taxon becomes a node linked to the others through shared lineage, habitats, and trophic relationships — so you can move from one species to the next by following real ecological connections, not just by browsing a flat list.

It weaves together several French biodiversity data sources:

- **TAXREF v18** (MNHN) — the national taxonomic reference, 708,685 taxa (the graph's backbone).
- **BDC Statuts v18** — 447,664 conservation statuses (Red Lists, protections, directives, conventions).
- **Biological traits** — PanTHERIA (mammals), AVONET (birds), AmphiBIO (amphibians) + Wikidata.
- **Trophic interactions** — GloBI (who eats whom), the edges that link species together.
- **External enrichments** — Wikipedia, GBIF, Wikimedia Commons, Biodiversity Heritage Library.

The graph is queryable in several ways: an interactive web explorer, a REST API, a natural-language agent, an MCP server (for AI assistants), and a SPARQL endpoint over the RDF representation.

---

## Stack at a glance

pnpm workspaces · Node 24 · TypeScript 5.9 · Express 5 · React + Vite + Tailwind + shadcn/ui · PostgreSQL + Drizzle · Zod (`zod/v4`) · Orval (codegen from OpenAPI) · esbuild · wouter (front) + Express (back).

Monorepo organized into `artifacts/` (deployable apps) and `lib/` (shared libraries). See the `pnpm-workspace` skill for the structure and TypeScript setup.

---

## Caching strategy

External sources (Wikidata, Wikipedia, GBIF, EUNIS…) are slow, so every enrichment is fetched once and then served from progressively closer layers:

1. **In-memory (L1)** — a per-process `Map`, ~ms latency. Fast but **wiped on every restart** (deploy, sleep, autoscale), so in production it is often cold.
2. **Database (L2)** — persisted in the `external_cache` table (PostgreSQL). Survives restarts, so once a species is looked up, everyone benefits afterwards. Typical warm read ~15–20 ms vs ~1.7 s hitting the upstream. This is the layer that matters in autoscale prod.
3. **Upstream source** — only called when both caches are empty or expired, with a short timeout (e.g. 5 s for Wikidata) so a slow source never blocks the user.

Key policies:

- **Split TTLs** — successful responses are kept long (e.g. 7 days for traits); network errors are negatively cached only briefly (5 min) so a transient outage is retried quickly.
- **Negative caching** — "no Wikidata item for this species" is remembered too, to avoid re-asking on every visit.
- **Stale-on-error** — if an upstream is down but a stale row exists, the stale value is served instead of an error.
- **Fresh local data** — static traits (PanTHERIA, AVONET…) come from our own tables and are re-attached on each response rather than frozen in the cache.

The unified profile (`taxon_profile_summary`, 7-day TTL, write-through) and the traits endpoint both follow this L1 → L2 → upstream model. See [`docs/API.md`](docs/API.md#caching-strategy) for provider-by-provider details.

---

## Quick start

Prerequisites: Node 24, pnpm, a PostgreSQL database (`DATABASE_URL`).

```bash
pnpm install                                          # install dependencies
pnpm --filter @workspace/db run push                  # create the schema (dev)
pnpm --filter @workspace/scripts run import-taxref     # import TAXREF + BdC data
pnpm --filter @workspace/api-server run dev            # start the API
pnpm --filter @workspace/taxref-explorer run dev       # start the front end
```

> On Replit, apps run via the configured workflows — no need to run `pnpm dev` manually.

Expected source data: `data/TAXREFv18.txt`, `data/bdc_18_01.csv`.

---

## Useful commands

```bash
pnpm run typecheck                                     # full typecheck (all packages)
pnpm run build                                         # typecheck + build
pnpm --filter @workspace/api-spec run codegen          # regenerate hooks + Zod schemas from OpenAPI
```

The full list (trait ingestion, RDF export, Wikidata/GloBI materialization, index builds) is in [`docs/API.md`](docs/API.md#key-commands).

---

## Documentation

The technical docs are split by topic under `docs/`:

- [`docs/STACK.md`](docs/STACK.md) — Stack, data pipeline, DB schema, auxiliary tables (`external_cache`, `taxon_search_index`).
- [`docs/API.md`](docs/API.md) — REST endpoints, `/api/ask` agent, MCP, external APIs, pnpm commands.
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — Pages, canonical URLs (`/taxon/:slug`), taxon UX, SEO, responsive layout.
- [`docs/SHARE.md`](docs/SHARE.md) — Share answer (chat), Share discovery (viral card), server routes `/share` + `/api/og`.
- [`docs/RDF-SPARQL.md`](docs/RDF-SPARQL.md) — RDF vocabularies, TTL dump, Oxigraph, refresh runbook.
- [`docs/TRAITS.md`](docs/TRAITS.md) — Trait sources (PanTHERIA, AVONET, AmphiBIO), MCP exposure.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — General-audience overview (non-technical).

---

## License & data

Data comes from TAXREF / BDC Statuts (MNHN — INPN), GBIF, GloBI, Wikidata, Wikipedia, and the Biodiversity Heritage Library. Please respect each source's licenses and reuse conditions.
