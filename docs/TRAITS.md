# Trait Sources (Static, DB-cached)

The `species_traits` table (PK = `cd_nom` + `source`) caches per-species traits from open scientific datasets, joined to TAXREF by case-insensitive `lb_nom` and restricted by `classe`. The `/api/taxons/:cdNom/traits` endpoint merges these with live Wikidata data and returns `staticSources[]` alongside `traits[]`. Wikidata failures degrade gracefully (the panel still renders DB sources).

## Sources currently active

- **PanTHERIA** (Mammalia, ~466 species, 18-trait blocks) — Jones et al. 2009, Ecological Archives E090-184.
- **AVONET** (Aves, ~1865 species, 17-trait blocks) — Tobias et al. 2022, Ecology Letters 25:581-597, CC-BY 4.0.
- **AmphiBIO** (Amphibia, ~193 species, 14-trait blocks) — Oliveira et al. 2017, Scientific Data 4:170123, CC-BY 4.0.
- **SquamBase** — registered in source registry; data ingestion pending an open download URL for the Wiley supplementary materials.

## MCP exposure

The merged trait payload is also exposed to MCP clients via the `get_traits` tool (alongside `get_taxon`, `get_statuts`, `get_interactions`, `get_wikipedia`, `get_gbif`, etc.) — **22 tools total** on the MCP server (`/api/mcp`, v1.4.0). For trait-based discovery, MCP clients can also call `query_traits` (e.g. mammals heavier than 100 kg → source=pantheria, traitKey=adultBodyMass, minValue=100000) after listing available trait keys with `get_trait_keys`.
