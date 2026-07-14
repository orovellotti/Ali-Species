---
name: taxon_search_index trigram index
description: Why /api/taxons/search can be catastrophically slow and how the GIN trigram index must be kept in sync across dev and prod.
---

# taxon_search_index GIN trigram index

`/api/taxons/search` filters `taxon_search_index` (~708k rows) with a leading-wildcard
`ILIKE '%q%'` **and** the pg_trgm similarity operator `%`. Both require a GIN trigram
index (`gin (normalized_text gin_trgm_ops)`) or every keystroke triggers a full seq scan
(measured 8-21s end-to-end; ~2.7s just for the filter).

**Why the index kept going missing:** the Drizzle schema historically declared only the
plain btree indexes and left the trigram one to be created manually inside
`scripts/src/build-search-index.ts` (index name `idx_taxon_search_normalized_trgm`).
A DB whose search index was built before that line existed — or via a path that skipped
the script — ends up with no trigram index and slow search.

**Fix applied:** the trigram index is now also declared in the Drizzle schema
(`lib/db/src/schema/taxon_search_index.ts`) via `.using("gin", t.normalizedText.op("gin_trgm_ops"))`,
so it is part of the managed schema.

**How to apply / gotchas:**
- Dev DB: the index exists now; if a fresh DB is ever slow on search, check
  `SELECT indexname FROM pg_indexes WHERE tablename='taxon_search_index'` for
  `idx_taxon_search_normalized_trgm`, and either re-run build-search-index or
  `CREATE INDEX ... USING gin (normalized_text gin_trgm_ops)`.
- Production: `executeSql` is read-only against prod, so the index can't be pushed
  from the agent. It reaches prod only via the Publish flow (schema diff) now that
  Drizzle declares it — so a **republish is required** for prod to get it.
