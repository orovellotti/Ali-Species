# Stack & Database

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

## Data Pipeline

- TAXREF v18 data (708,685 taxa) imported from TSV file into PostgreSQL
- BDC Statuts v18 (447,664 conservation statuts) imported from CSV into PostgreSQL
- Import script: `scripts/src/import-taxref.ts`
- Source data: `data/TAXREFv18.txt`, `data/bdc_18_01.csv`
- Trigram indexes (pg_trgm) for fast ILIKE search
- `unaccent` extension : la recherche normalise les accents des deux côtés (`unaccent(col) ILIKE unaccent(pat)`) pour que "mesange" matche "Mésange". Appliqué dans `/api/taxons/search`, MCP `search_taxons` et `lib/query.ts` (agent conversationnel).

## Database Schema

### `taxons` table
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

### Cache externe générique (`external_cache`)

Table `external_cache` (PK = `provider` + `cache_key`, payload jsonb, status, expires_at). Helper `artifacts/api-server/src/lib/externalCache.ts` → `getCachedOrFetch({provider, cacheKey, ttlSeconds, fetcher, allowStaleOnError})` avec negative-cache 5 min sur erreur. Routes `/wikipedia`, `/gbif`, `/media` y délèguent. Les caches dédiés `wikidata_cache`, `globi_cache`, `bhl_cache` restent (couplés aux scripts de matérialisation RDF).

### Index recherche dédié (`taxon_search_index`)

Table dénormalisée (1 row/cd_nom) folded : `scientific_name` + `vernacular_fr/en` + `synonyms[]` (autres rows même cd_ref) → `normalized_text` lower+unaccent. `rank_boost` (ES=100 > GN=70 > FM=50 > … > KD=10, +5 si `is_reference`). `/api/taxons/search` : exact → prefix mot → prefix middle → trigram, ordonné par `rank_boost` puis `is_reference` puis `similarity`. Index GIN `gin_trgm_ops` sur `normalized_text` créé manuellement par le script (drizzle ne sait pas pousser l'opclass). Fallback automatique sur l'ancienne logique ILIKE si la table est vide.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
