#!/usr/bin/env bash
# ALi Species — production migration runbook.
#
# Idempotent. Run this against the production database after every deploy
# that introduces a new table or new search/profile feature. Steps:
#
#   1. Ensure required PostgreSQL extensions (unaccent, pg_trgm).
#      Without `unaccent`, `/api/taxons/search` crashes with
#      "function unaccent(text) does not exist" wrapped by drizzle as
#      "Failed query: select cd_nom, cd_ref... from taxons" — which is
#      exactly the symptom seen on alispecies.io as of May 2026.
#
#   2. Push the drizzle schema (creates external_cache,
#      taxon_profile_summary, taxon_search_index, etc.).
#
#   3. Rebuild taxon_search_index from the live taxons table
#      (~708k rows, ~1 minute).
#
# The optional step 4 (build-profile-summaries) is NOT run automatically:
# it depends on the API server being up and reachable, hits external APIs
# (Wikipedia/GBIF) and takes hours. Run it separately when ready:
#
#   API_BASE=https://alispecies.io pnpm --filter @workspace/scripts run build-profile-summaries
#
# Required env:
#   DATABASE_URL     — production Postgres connection string
#
# Optional env:
#   SKIP_EXTENSIONS=1   — skip step 1 (e.g. if you have no superuser)
#   SKIP_PUSH=1         — skip step 2 (schema already in sync)
#   SKIP_SEARCH=1       — skip step 3 (search index already built)
#
# Usage:
#   DATABASE_URL=postgres://... bash scripts/migrate-prod.sh

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 1
fi

# Refuse to clobber a local dev DB by accident.
if [[ "$DATABASE_URL" == *"localhost"* || "$DATABASE_URL" == *"127.0.0.1"* ]]; then
  echo "WARN: DATABASE_URL points at localhost. Continuing in 5s — Ctrl-C to abort..." >&2
  sleep 5
fi

cd "$(dirname "$0")/.."

echo
echo "== ALi Species production migration =="
echo "Target host: $(node -e 'console.log(new URL(process.env.DATABASE_URL).host)')"
echo

if [[ "${SKIP_EXTENSIONS:-0}" != "1" ]]; then
  echo "[1/3] Ensuring PostgreSQL extensions (unaccent, pg_trgm)..."
  pnpm --filter @workspace/scripts exec tsx ./src/ensure-extensions.ts
else
  echo "[1/3] SKIPPED (SKIP_EXTENSIONS=1)"
fi
echo

if [[ "${SKIP_PUSH:-0}" != "1" ]]; then
  echo "[2/3] Pushing drizzle schema (db push)..."
  pnpm --filter @workspace/db run push
else
  echo "[2/3] SKIPPED (SKIP_PUSH=1)"
fi
echo

if [[ "${SKIP_SEARCH:-0}" != "1" ]]; then
  echo "[3/3] Rebuilding taxon_search_index (~708k rows, ~1 min)..."
  pnpm --filter @workspace/scripts run build-search-index
else
  echo "[3/3] SKIPPED (SKIP_SEARCH=1)"
fi
echo

echo "== Migration complete =="
echo
echo "Verify:"
echo "  curl -s 'https://alispecies.io/api/taxons/search?q=mesange&limit=3' | head"
echo
echo "Optional next step (long-running, hits external APIs):"
echo "  API_BASE=https://alispecies.io pnpm --filter @workspace/scripts run build-profile-summaries"
