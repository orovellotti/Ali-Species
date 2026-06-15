# ALi Species

Webapp pour explorer le référentiel taxonomique français **TAXREF v18** (~708 000 espèces) : recherche, statuts de conservation BdC, traits biologiques, interactions trophiques, agent conversationnel, MCP et SPARQL.

**Production** : <https://alispecies.io>

---

## C'est quoi

ALi Species agrège plusieurs sources de données sur la biodiversité française et les rend explorables au même endroit :

- **TAXREF v18** (MNHN) — le référentiel taxonomique national, 708 685 taxons.
- **BDC Statuts v18** — 447 664 statuts de conservation (Listes rouges, protections, directives, conventions).
- **Traits biologiques** — PanTHERIA (mammifères), AVONET (oiseaux), AmphiBIO (amphibiens) + Wikidata.
- **Interactions trophiques** — GloBI (qui mange qui).
- **Enrichissements externes** — Wikipedia, GBIF, Wikimedia Commons, Biodiversity Heritage Library.

Le tout est requêtable de plusieurs façons : interface web, API REST, agent en langage naturel, serveur MCP (pour assistants IA), et endpoint SPARQL.

---

## Stack en bref

pnpm workspaces · Node 24 · TypeScript 5.9 · Express 5 · React + Vite + Tailwind + shadcn/ui · PostgreSQL + Drizzle · Zod (`zod/v4`) · Orval (codegen depuis OpenAPI) · esbuild · wouter (front) + Express (back).

Monorepo organisé en `artifacts/` (apps déployables) et `lib/` (libs partagées). Voir la skill `pnpm-workspace` pour la structure et la config TypeScript.

---

## Démarrage rapide

Prérequis : Node 24, pnpm, une base PostgreSQL (`DATABASE_URL`).

```bash
pnpm install                                          # installe les dépendances
pnpm --filter @workspace/db run push                  # crée le schéma (dev)
pnpm --filter @workspace/scripts run import-taxref     # importe les données TAXREF + BdC
pnpm --filter @workspace/api-server run dev            # lance l'API
pnpm --filter @workspace/taxref-explorer run dev       # lance le front
```

> Sur Replit, les apps tournent via les workflows configurés — pas besoin de lancer `pnpm dev` à la main.

Données source attendues : `data/TAXREFv18.txt`, `data/bdc_18_01.csv`.

---

## Commandes utiles

```bash
pnpm run typecheck                                     # typecheck complet (tous les packages)
pnpm run build                                         # typecheck + build
pnpm --filter @workspace/api-spec run codegen          # régénère hooks + schémas Zod depuis l'OpenAPI
```

La liste complète (ingestion des traits, export RDF, matérialisation Wikidata/GloBI, build des index) est dans [`docs/API.md`](docs/API.md#key-commands).

---

## Documentation

La doc technique est éclatée par thème dans `docs/` :

- [`docs/STACK.md`](docs/STACK.md) — Stack, pipeline de données, schéma DB, tables annexes (`external_cache`, `taxon_search_index`).
- [`docs/API.md`](docs/API.md) — Endpoints REST, agent `/api/ask`, MCP, APIs externes, commandes pnpm.
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — Pages, URLs canoniques (`/taxon/:slug`), UX taxon, SEO, layout responsive.
- [`docs/SHARE.md`](docs/SHARE.md) — Share answer (chat), Share discovery (carte virale), routes serveur `/share` + `/api/og`.
- [`docs/RDF-SPARQL.md`](docs/RDF-SPARQL.md) — Vocabulaires RDF, dump TTL, Oxigraph, runbook de refresh.
- [`docs/TRAITS.md`](docs/TRAITS.md) — Sources de traits (PanTHERIA, AVONET, AmphiBIO), exposition MCP.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Vue d'ensemble grand public (non technique).

---

## Licence & données

Les données proviennent de TAXREF / BDC Statuts (MNHN — INPN), GBIF, GloBI, Wikidata, Wikipedia et de la Biodiversity Heritage Library. Merci de respecter les licences et conditions de réutilisation de chaque source.
