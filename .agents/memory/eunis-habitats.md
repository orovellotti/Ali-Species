---
name: EUNIS habitats source
description: How to fetch species→habitat data from EUNIS/EEA — external facts not visible from code.
---

# EUNIS (European Nature Information System, EEA) — species → habitat

**No formal API.** The only working source is the live HTML factsheet:
`https://eunis.eea.europa.eu/species/{Genre espece}` — resolved **by scientific name** (URL-encoded, space → %20), NOT by any code.

**Parse targets:** the `<ul>` lists following the table headers `Most preferred habitats`
and `May also occur in`. A bogus/uncovered name renders an `<h1>` containing
`No results found for this search`.

**Coverage is partial:** mainly assessed European vertebrates (amphibians, mammals,
birds). Plants (Quercus, Fagus…) return empty. Treat empty as "not covered", not an error.

**Do NOT use the EUNIS RDF (`.rdf`) endpoints or its SPARQL** — they are dead/empty.

**Why:** researched during the EUNIS integration; these are upstream realities that
cannot be discovered by reading our code, and the RDF/SPARQL dead-ends waste time if retried.

**How to apply:** in this repo, `fetchEunis()` in
`artifacts/api-server/src/lib/profileFetchers.ts` implements the scrape via
`getCachedOrFetch` (provider `eunis_habitats`, 7d TTL). It follows the "interactions"
pattern: fetched live in BOTH branches of `/profile` (summary + live), no summary DB
column, no write-through — the `external_cache` layer is the only persistence.
