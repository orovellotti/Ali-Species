# API & Commands

## API Endpoints

- `GET /api/taxons/search?q=...&regne=...&limit=...` — Autocomplete search by scientific or vernacular name
- `GET /api/taxons/:cdNom` — Get full taxon details
- `GET /api/taxons/:cdNom/profile` — **Unified profile endpoint** : agrège taxon + classification + childrenSummary + media + statuts + sensitivity + wikipedia + gbif + eunis + habref + traitsSummary + interactionsSummary + shareSummary en 1 requête (`Promise.allSettled`, dégradation gracieuse). Préfère `taxon_profile_summary` (TTL 7 j) si frais → header `X-Profile-Source: summary`, sinon calcul live + write-through. Le frontend `taxon.tsx` utilise `useGetTaxonProfile` ; les routes individuelles restent disponibles en fallback.
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
- `GET /api/taxons/:cdNom/traits` — Merged trait payload. Static sources (PanTHERIA/AVONET/AmphiBIO/SquamBase) viennent des tables locales et sont **rattachés frais à chaque réponse** ; les traits Wikidata passent par le cache **L1 mémoire → L2 base (`external_cache`, provider `wikidata-traits`, TTL 7 j)** puis fetch live (timeout 5 s). Voir [Caching strategy](#caching-strategy).
- `GET /api/taxons/:cdNom/interactions` — GloBI biotic interactions (eats / eaten by / parasite of / etc.)
- `POST /api/ask` — Natural-language agent (LLM-backed) that composes queries against `query_taxons`, `query_traits`, `get_taxon`, `get_statuts`, `get_interactions`, `get_traits`, `get_wikipedia`, `get_gbif` tools. Cache LRU in-memory 256 entrées TTL 1 h sur questions sans historique (header `X-Ask-Cache: hit|miss`).
- `GET /api/mcp` — MCP server endpoint (v1.4.0) exposing **24 tools** to AI assistants (Claude, Cursor, ChatGPT…), grouped in 5 families: search/navigation (search_taxons, query_taxa, get_taxon, get_classification, get_children, get_parent, get_synonyms, get_random_species, list_taxonomic_facets), statuses (get_statuts, status_breakdown, list_status_types, list_territoires), stats & traits (get_global_stats, query_traits, get_trait_keys, get_traits), external enrichments (get_interactions, get_wikipedia, get_gbif, get_bhl, get_eunis_habitats, get_habref_habitats), and SPARQL (run_sparql proxied to Oxigraph upstream — the graph includes EUNIS habitat triples `alivocab:eunisHabitat`/`eunisPreferredHabitat`/`eunisBreedingHabitat`/`eunisWinteringHabitat`/`eunisFactsheet`; clear degradation message when the triplestore is unavailable in autoscale prod).
- `GET /api/sparql` (and `POST`) — SPARQL 1.1 endpoint, proxied to Oxigraph; returns **503 with local-setup hint** when Oxigraph is unavailable
- `GET /api/sparql/ui` — YASGUI SPARQL client; auto-falls back to a static "run Oxigraph locally" instructions page when upstream is down
- `GET /api/sparql/status` — Triplestore reachability + triple count
- `GET /api/exports/info` — JSON metadata about the latest RDF dump (filename, size, mtime, parsed stats CSV)
- `GET /api/exports/rdf.ttl.gz` — Latest gzipped Turtle dump (~103 MB, 17.27M triples). En **dev** : streamé localement depuis `exports/`. En **prod** (NODE_ENV=production) : **302 redirect vers une URL signée GCS** (15 min) — bypass de la limite Cloud Run de 32 MB. Fichier hébergé dans le bucket Replit Object Storage sous `public/exports/`. Re-upload via le snippet `code_execution` dans `docs/ARCHITECTURE.md` après chaque rebuild du dump.
- `GET /api/exports/stats.csv` — Streams the stats CSV coupled to the same dump (shared `<sha>` prefix)

## `/api/ask` Conversational Agent

- Loop budget: `turn < 8` (handles alias resolution + multi-call patterns like "rapaces" = Accipitriformes + Falconiformes).
- **Anthropic resilience**: 1 transparent retry with 400 ms backoff on transient errors (HTTP 5xx, 429, `APIConnectionError`, `ECONNRESET`/`ETIMEDOUT`/`fetch failed`). Worst-case latency bounded by `ANTHROPIC_TIMEOUT_MS * 2` (= 60 s). Non-retryable errors still return 502/504 with friendly message + last partial result.
- **System prompt rules** : "rapaces (diurnes)" → DEUX appels (Accipitriformes + Falconiformes) ; "rapaces nocturnes" / "chouettes" / "hiboux" → Strigiformes ; toute question superlative ("le plus grand/lourd/long", "trié par", "top N") DOIT utiliser `query_traits` avec `traitKey` ET `sortBy=value_desc|value_asc` (jamais `query_taxa` qui ne renvoie pas d'ordre). Mappings: envergure→avonet/wingLen, masse→pantheria/adultBodyMass, longévité→pantheria/maxLongevity ou avonet/longevity.
- **Cache LRU** in-memory (256 entrées, TTL 1 h, key = question normalisée), uniquement quand `history` est vide. Header `X-Ask-Cache: hit|miss`.

## Caching strategy

Les sources externes sont lentes, donc chaque enrichissement est cherché une fois puis resservi depuis des couches de plus en plus proches :

1. **L1 — mémoire** : `Map` par process (~ms). Rapide mais **vidée à chaque redémarrage** (déploiement, veille, autoscale) → souvent froide en prod.
2. **L2 — base** : table `external_cache` (PostgreSQL), clé `(provider, cache_key)`. **Survit aux redémarrages** : ~15–20 ms à chaud contre ~1,7 s en tapant l'upstream. C'est la couche qui compte en prod autoscale.
3. **Upstream** : appelé seulement si L1 et L2 sont vides/périmés, avec timeout court (5 s Wikidata) pour ne jamais bloquer l'utilisateur.

Helper commun : `getCachedOrFetch()` (`artifacts/api-server/src/lib/externalCache.ts`), qui gère l'upsert, les TTL et la dégradation. Politiques :

- **TTL différenciés** : réponses OK gardées longtemps (7 j traits/Wikipedia/EUNIS, 24 h GBIF) ; erreurs réseau en **cache négatif court** (5 min par défaut) pour retenter vite.
- **Cache négatif** : une absence (pas d'item Wikidata pour l'espèce) est aussi mémorisée pour ne pas reposer la question à chaque visite.
- **Stale-on-error** (`allowStaleOnError`) : si l'upstream tombe mais qu'une vieille row existe, on ressert la version périmée plutôt qu'une erreur.
- **Données locales fraîches** : les traits statiques (tables internes) sont rattachés à chaque réponse, jamais figés dans le cache.

Providers stockés dans `external_cache` : `wikidata-traits`, `wikipedia`, `gbif`, `eunis_habitats`, `commons`… Deux caches spécialisés vivent à côté : `bhl_cache` (BHL, 30 j) et `taxon_profile_summary` (profil unifié, TTL 7 j, write-through). Le cache LRU mémoire de `/api/ask` (256 entrées, TTL 1 h) est distinct et non persistant. Purge : `POST /api/admin/cache/clear` (voir Admin / Ops).

## External APIs

- **Wikipedia REST API** — FR/EN page summaries for taxon descriptions (`/api/rest_v1/page/summary/`)
- **Wikipedia/Wikimedia Commons** — Taxon images (fallback chain)
- **GBIF Species API** — Species matching, occurrence counts, IUCN Red List categories
- **Biodiversity Heritage Library (BHL)** — Historical publication references via `op=PublicationSearch` (requires `BHL_API_KEY`, free at https://www.biodiversitylibrary.org/getapikey.aspx). Cached per cd_nom 30 days in `bhl_cache` table.
- Note: TAXREF LD (MNHN) is unavailable due to cyberattack since summer 2025

## Admin / Ops

- **`POST /api/admin/cache/clear`** — purge la table `external_cache` (EUNIS, Wikipedia, GBIF, Commons…) pour forcer un refetch à la prochaine consultation. Tourne dans l'app déployée → droits d'écriture sur la base live (l'outillage n'a qu'un réplica read-only en prod).
  - Auth : header `Authorization: Bearer $ADMIN_TOKEN` ou `x-admin-token: $ADMIN_TOKEN` (comparaison timing-safe). `503` si `ADMIN_TOKEN` non configuré, `401` si invalide.
  - Body optionnel `{ "provider": "eunis_habitats" }` pour cibler un provider ; sans body → purge **tous** les providers.
  - Réponse : `{ ok, provider, deleted }`.
  - Exemple : `curl -X POST https://alispecies.io/api/admin/cache/clear -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"provider":"eunis_habitats"}'`

- **`POST /api/admin/habref/import`** — charge la table offline `habref_habitats` en prod. Les CSV HABREF sont parsés en dev (`scripts/src/import-habref.ts`) ; cet endpoint reçoit les lignes déjà agrégées et **remplace la table de façon atomique** (transaction, refus si `rows` vide → jamais de table vidée par erreur). Existe parce que la base prod n'est écrivable que depuis l'app déployée.
  - Même auth que ci-dessus. Body : `{ "rows": [{ "cdRef": number, "habitats": [{ "code", "label" }] }] }`. `400` si `rows` vide/invalide. Réponse : `{ ok, rows }`.
  - Body volumineux (~3 Mo pour ~6000 lignes) : limite JSON portée à 32 Mo pour cette route uniquement.
  - Chargement prod : exporter les lignes dev puis POST vers `https://alispecies.io/api/admin/habref/import` (voir runbook ci-dessous).

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
- `pnpm --filter @workspace/scripts run build-profile-summaries` — précalcule la table `taxon_profile_summary` (HTTP-based, batch + concurrency, idempotent)
- `pnpm --filter @workspace/scripts run build-search-index` — reconstruit `taxon_search_index` (1 row/cd_nom, fold synonymes sur la row de référence, ~708k rows, GIN trigram sur `normalized_text`)
