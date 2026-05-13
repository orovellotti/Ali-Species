# ALi Species

Webapp pour explorer le référentiel taxonomique français **TAXREF v18** (~708 000 espèces) avec recherche, statuts de conservation BdC, traits, interactions trophiques GloBI, agent conversationnel LLM, MCP et SPARQL.

Production : <https://alispecies.io>

## Documentation

La doc technique est éclatée en plusieurs fichiers dans `docs/` :

- [`docs/STACK.md`](docs/STACK.md) — Stack, data pipeline, schéma DB, tables annexes (`external_cache`, `taxon_search_index`)
- [`docs/API.md`](docs/API.md) — Endpoints REST, agent `/api/ask`, MCP, external APIs, commandes pnpm
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — Pages, URLs canoniques (`/taxon/:slug`), UX taxon, SEO, layout responsive
- [`docs/SHARE.md`](docs/SHARE.md) — Share answer (chat), Share discovery (viral card), routes serveur `/share` + `/api/og`
- [`docs/RDF-SPARQL.md`](docs/RDF-SPARQL.md) — Vocabulaires RDF, dump TTL, Oxigraph, refresh runbook, dégradation autoscale
- [`docs/TRAITS.md`](docs/TRAITS.md) — Sources de traits (PanTHERIA, AVONET, AmphiBIO), MCP exposure
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Vue d'ensemble grand-public (non technique)

## Stack en bref

pnpm workspaces · Node 24 · TypeScript 5.9 · Express 5 · React + Vite + Tailwind + shadcn/ui · PostgreSQL + Drizzle · Zod (`zod/v4`) · Orval (codegen depuis OpenAPI) · esbuild · wouter (front) + Express (back).

See the `pnpm-workspace` skill for workspace structure and TypeScript setup.

## User preferences

- Communication en français, ton casual.
- Pas d'emojis sauf demande explicite.
- Préfère les explications de haut niveau aux détails techniques sauf demande explicite.
