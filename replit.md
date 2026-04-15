# Workspace

## Overview

ALi species - A web application for browsing the French national taxonomic reference (TAXREF v18) with autocomplete search and taxon images from Wikipedia.

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

## Architecture

### Data Pipeline
- TAXREF v18 data (708,685 taxa) imported from TSV file into PostgreSQL
- BDC Statuts v18 (447,664 conservation statuts) imported from CSV into PostgreSQL
- Import script: `scripts/src/import-taxref.ts`
- Source data: `data/TAXREFv18.txt`, `data/bdc_18_01.csv`
- Trigram indexes (pg_trgm) for fast ILIKE search

### API Endpoints
- `GET /api/taxons/search?q=...&regne=...&limit=...` — Autocomplete search by scientific or vernacular name
- `GET /api/taxons/:cdNom` — Get full taxon details
- `GET /api/taxons/:cdNom/children` — Get subordinate taxa
- `GET /api/taxons/:cdNom/classification` — Get classification hierarchy (breadcrumbs)
- `GET /api/taxons/:cdNom/media` — Get images from Wikipedia/Wikimedia Commons
- `GET /api/taxons/:cdNom/statuts` — Get BDC conservation statuts (Liste rouge, Protection, Directives, Conventions, etc.)
- `GET /api/taxons/:cdNom/wikipedia` — Get Wikipedia FR extract (with EN fallback)
- `GET /api/taxons/:cdNom/gbif` — Get GBIF data (occurrence count, IUCN Red List status)
- `GET /api/taxons/stats` — Get database statistics

### Frontend Pages
- `/` — Home page with search bar, statistics, and featured kingdoms (Animalia/183716, Plantae/187079, Fungi/187496)
- `/taxon/:slug` — Taxon detail page (SEO-friendly URLs like `/taxon/61098-capra-ibex`); supports old `/taxon/:cdNom` format via `parseCdNomFromParam()`
- `/a-propos` — About page with PatriNat and Natural Solutions credits

### UX Features (Taxon Page)
- **Species dashboard**: Sensitivity score + driver badges displayed prominently near title
- **Image lightbox**: Click-to-zoom with fullscreen overlay (X to close)
- **Sticky image column**: Right sidebar stays visible while scrolling
- **SEO**: react-helmet-async with title/meta/OG/Twitter/JSON-LD structured data
- **Visual hierarchy**: UICN badge color-coded, tags with borders and icons, Wikipedia inline, taxonomy collapsed by default
- **External links**: INPN + GBIF side by side below image

### External APIs
- **Wikipedia REST API** — FR/EN page summaries for taxon descriptions (`/api/rest_v1/page/summary/`)
- **Wikipedia/Wikimedia Commons** — Taxon images (fallback chain)
- **GBIF Species API** — Species matching, occurrence counts, IUCN Red List categories
- Note: TAXREF LD (MNHN) is unavailable due to cyberattack since summer 2025

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run import-taxref` — import TAXREF data into DB

## Database Schema

### taxons table
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

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
