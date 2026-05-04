**To:** Richard
**From:** [your name]
**Subject:** ALi Species — what it does, and adapting it for an Abu Dhabi Red List

Hi Richard,

Quick note to walk you through the tool I've been building (ALi Species) and how I think we could repurpose it for an Abu Dhabi / UAE biodiversity portal.

## What ALi Species is today

It's a French-language web app that turns the national taxonomic reference (TAXREF v18, ~660 000 taxa) into an explorable species encyclopedia. For any species in metropolitan or overseas France you get, on a single page:

- **Identity & taxonomy** — full classification chain (kingdom → species), valid name, synonyms, vernacular names (FR/EN), author citation.
- **Conservation status** — every applicable IUCN listing (national, regional, European, world), legal protection (national + EU directives), CITES, invasive species lists, regional ZNIEFF-determining lists. All harmonised through France's BdC Statuts dataset.
- **A "sensitivity score" (0–100)** with explanatory drivers — a simple at-a-glance indicator that aggregates the protection/threat signals.
- **Biological traits** — life history, morphology and ecology, pulled live from Wikidata and complemented by four open scientific datasets cached locally:
  - PanTHERIA (mammals, ~5 400 species)
  - AVONET (birds, ~11 000 species)
  - AmphiBIO (amphibians, ~6 500 species)
  - SquamBase (squamates, registered, ingestion pending)
- **Trophic interactions** — who eats whom, parasites, hosts, pollinators — sourced from GloBI (Global Biotic Interactions, ~6M records).
- **External identifiers** — one-click links to GBIF, iNaturalist, EOL, NCBI, ITIS, Catalogue of Life, WoRMS, IPNI, POWO, etc.
- **Distribution map & observation count** from GBIF.
- **A descriptive summary** in plain language (drawn from Wikipedia and a generative model used only to phrase, never to invent values).
- **A full Sources page** with publisher, licence and formal citation for every dataset — so anyone can audit where each number comes from.

The frontend is a React app, the backend is a Node/Express API; data sits in a PostgreSQL database. Everything we display has a documented open licence, and every value carries a clickable badge back to its source.

## Why it transfers well to Abu Dhabi

The architecture is intentionally *source-agnostic*. The core machinery — ingest a national taxonomic reference, layer multiple status frameworks on top, attach trait and interaction data, render fiches with full citation chain — has nothing French-specific in it. To adapt it for the UAE / Emirate of Abu Dhabi, we would essentially swap the data sources, not rewrite the engine.

Concretely, here's what would change:

| Layer | France version (today) | Abu Dhabi version (proposed) |
|---|---|---|
| Taxonomic backbone | TAXREF v18 (MNHN) | EAD's species checklist for Abu Dhabi, completed for missing groups via GBIF / Catalogue of Life |
| Conservation status | BdC Statuts (national IUCN, EU directives, French law) | Abu Dhabi Red List assessments (EAD), UAE national list, IUCN global, CITES, CMS, regional Arabian Peninsula lists |
| Legal framework | French Code de l'environnement, EU Habitats & Birds Directives | UAE federal environmental law, Abu Dhabi Law No. 16 of 2017, hunting/fishing decrees |
| Indigenous knowledge | — | Arabic vernacular names, traditional uses, local cultural significance (could come from EAD's own data) |
| Distribution | GBIF occurrences | GBIF + EAD's own observation data (terrestrial surveys, marine surveys, satellite tracking) |
| Trait datasets | PanTHERIA, AVONET, AmphiBIO + Wikidata | Same global datasets remain valid (most are species-level, worldwide) — they already cover Arabian fauna |
| Interactions | GloBI | GloBI works globally, no change needed |
| Language | French | Arabic + English (the UI is already i18n-friendly; we'd add an RTL stylesheet for Arabic) |
| Branding & domain | natural-solutions.eu | EAD-branded, deployed under an EAD subdomain |

## What's specifically interesting for EAD

A few things the tool gives you that are usually missing from existing red list publications:

1. **One species, one page, every status** — instead of cross-referencing five PDFs to know whether a species is protected, threatened, or hunted, the answer is on a single screen with the legal text behind each badge.
2. **A public-facing "sensitivity dashboard"** — useful for environmental impact assessments, EIA consultants, and outreach to schools/universities.
3. **Audit-grade citations** — every number is traceable to a peer-reviewed dataset or a legal text. This matters for any official red list publication.
4. **A REST/MCP API** — third parties (consultants, NGOs, ministries) can query the data programmatically. We already expose this for ALi Species; the same endpoints would expose the Abu Dhabi data.
5. **Easy yearly updates** — each data source has its own ingestion script. Updating the Red List = re-running one script.

## Suggested next step

If this is interesting, the most useful next conversation would be a 30-minute call with whoever at EAD owns:

- the current Abu Dhabi Red List spreadsheets / database, and
- the species checklist (or at least the vertebrate + flora master lists).

From there I can give you a concrete proposal — scope, timeline, and what a pilot covering, say, the terrestrial mammals + birds of Abu Dhabi would look like. My instinct is that a working prototype is achievable in 6 to 8 weeks once we have the source files.

Happy to demo the French version live whenever suits you — it's the fastest way to see what we're talking about.

Best,
[your name]
