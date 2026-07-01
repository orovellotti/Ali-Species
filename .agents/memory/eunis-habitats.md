---
name: EUNIS habitats source
description: How to fetch species→habitat data from EUNIS/EEA — external facts not visible from code.
---

# EUNIS (European Nature Information System, EEA) — species → habitat

**No formal API.** The only working source is the live HTML factsheet:
`https://eunis.eea.europa.eu/species/{Genre espece}` — resolved **by scientific name** (URL-encoded, space → %20), NOT by any code.

**Two different factsheet layouts** (upstream, not a code choice):
- Mammals / amphibians / reptiles: `<ul>` lists following the table headers
  `Most preferred habitats` and `May also occur in`.
- Birds: a table with `<th>Breeding habitats</th>` / `<th>Wintering habitats</th>`
  whose `<td>` holds a `<ul><li>` list. Birds have NO preferred/other lists, so a
  parser looking only for the mammal headers returns empty for every bird.
`fetchEunis()` parses all 4 lists; `parseEunisTableList()` handles the bird `<th>/<td>`
format. A bogus/uncovered name renders an `<h1>` containing `No results found for this search`.

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

## RDF export propagation

EUNIS is the only RDF source that lives in `external_cache` (no `cd_nom` column,
no materialisation script — populated lazily on page views). To include it in the
RDF dump, the export **reconstructs the cache key in SQL** and joins to taxons:
`lower(coalesce(nullif(array_to_string((string_to_array(nom_valide,' '))[1:2],' '),''), lb_nom))`
— this must stay in lockstep with `pickShortName()` (first 2 words of nomValide, else lbNom).

**Gotcha:** that join **fans out** — one cache entry (keyed by species short name)
matches many `cd_nom` (synonyms + infraspecies sharing the name). So any "taxon
count" metric over EUNIS must use `COUNT(DISTINCT t.cd_nom)`, not `count(*)` of cache rows.

Predicates (namespace `alivocab: https://ali-species.app/vocab/`): `eunisHabitat`
(all habitats, `@en` literals), `eunisPreferredHabitat` (preferred subset),
`eunisBreedingHabitat` / `eunisWinteringHabitat` (bird breeding/wintering subsets),
`eunisFactsheet` (source URL). Only `status='ok'` cache rows carry real data.
