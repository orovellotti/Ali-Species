# Architecture — ALI Species

> Explorateur du référentiel TAXREF v18 (≈ 708 000 taxons), enrichi des
> statuts BdC, du réseau trophique GloBI et d'un assistant IA en français.

---

## 1. Vue d'ensemble

```
                                        ┌────────────────────┐
                                        │ Wikipedia / GBIF   │
                                        │ GloBI / Anthropic  │
                                        └─────────▲──────────┘
                                                  │ HTTPS
   ┌──────────────────┐   HTTPS    ┌──────────────┴──────────────┐
   │   Navigateur     │◄──────────►│         API server          │
   │ (React + Vite)   │  /api/...  │   Express 5 + Drizzle ORM   │
   └──────────────────┘            └──────────────┬──────────────┘
                                                  │ SQL
                                          ┌───────▼────────┐
                                          │  PostgreSQL    │
                                          │  (Replit DB)   │
                                          └────────────────┘
```

**Type d'application** — Site web public en lecture seule. Aucune
authentification. Toutes les écritures se font hors-ligne via un script
d'import (`scripts/src/import-taxref.ts`) qui charge les fichiers TAXREF
et BdC dans PostgreSQL.

**Stack** — TypeScript partout, monorepo pnpm.

---

## 2. Structure du monorepo

```
workspace/
├── artifacts/                  ← applications déployables
│   ├── api-server/             ← backend Express 5
│   ├── taxref-explorer/        ← frontend React/Vite
│   └── mockup-sandbox/         ← infra Replit (canvas, non déployé)
├── lib/                        ← packages partagés
│   ├── db/                     ← schéma Drizzle + connexion Postgres
│   ├── api-zod/                ← schémas Zod générés depuis OpenAPI
│   ├── api-client-react/       ← client React Query généré (Orval)
│   └── integrations-anthropic-ai/  ← wrapper Anthropic
├── scripts/                    ← scripts d'import et utilitaires
└── docs/                       ← cette documentation
```

Chaque package partagé est consommé via la résolution `workspace:*` de
pnpm. Les artefacts ne se référencent jamais entre eux.

---

## 3. Données (PostgreSQL + Drizzle)

Deux tables principales, toutes deux remplies par import (jamais via
l'API) :

### `taxons` (≈ 708 000 lignes)

Issu de TAXREFv18.txt. Représente l'arbre taxonomique français complet
(faune, flore, champignons, métropole + outre-mer).

Colonnes clés : `cd_nom` (PK), `cd_ref` (référent — synonymie),
`regne`, `phylum`, `classe`, `ordre`, `famille`, `lb_nom` (nom
scientifique), `nom_vern` (nom vernaculaire FR), `rang`, `habitat`,
`group2_inpn`.

Index : `cd_ref`, `rang`, `famille`, `regne`, `lb_nom`.

### `bdc_statuts` (≈ 447 000 lignes)

Issu de bdc_18_01.csv. Contient les statuts juridiques et de
conservation (Liste Rouge UICN, Protection Nationale, Directives
Habitats/Oiseaux, ZNIEFF, conventions internationales…).

Colonnes clés : `cd_nom`, `cd_type_statut` (LRN, PN, DH…),
`code_statut` (CR, EN, VU…), `cd_sig` (territoire), `full_citation`.

Index : `cd_nom`, `cd_ref`, `cd_type_statut`.

Les schémas Drizzle vivent dans `lib/db/src/schema/`. La connexion
unique (`Pool` pg + `drizzle()`) est exportée depuis `lib/db/src/index.ts`.

---

## 4. API server (`artifacts/api-server`)

Express 5, ESM, bundle esbuild. Démarre en lisant `PORT` (fourni par
Replit) et écoute sur toutes les interfaces.

### Middleware (dans l'ordre)

1. `pino-http` — logs JSON structurés.
2. `cors` — allowlist regex `*.replit.dev`, `*.replit.app`,
   `localhost`, `127.0.0.1`. Origines inconnues bloquées.
3. `express.json({ limit: "100kb" })` — protection DoS.
4. `express.urlencoded({ limit: "100kb" })`.
5. Routeur monté sous `/api`.

### Routes (`src/routes/`)

| Endpoint | Description |
|---|---|
| `GET /api/healthz` | Liveness probe |
| `GET /api/taxons/search?q=…` | Autocomplete (trigram) |
| `GET /api/taxons/:cdNom` | Fiche complète |
| `GET /api/taxons/:cdNom/children` | Sous-taxons |
| `GET /api/taxons/:cdNom/classification` | Fil d'Ariane taxonomique |
| `GET /api/taxons/:cdNom/statuts` | Statuts BdC groupés |
| `GET /api/taxons/:cdNom/wikipedia` | Résumé Wikipedia FR/EN |
| `GET /api/taxons/:cdNom/gbif` | Données GBIF |
| `GET /api/taxons/:cdNom/media` | Images Wikimedia |
| `GET /api/taxons/:cdNom/interactions` | Réseau trophique GloBI |
| `GET /api/taxons/taxonomy-tree` | Arbre 5 niveaux pour treemap |
| `GET /api/taxons/stats` | Statistiques globales |
| `GET /api/taxons/random` | Taxon aléatoire |
| `GET /api/territoires` | Liste des territoires |
| `GET /api/status-types` | Types de statuts disponibles |
| `GET /api/image-proxy?url=…` | Proxy d'images Wikimedia (CORS) |
| `POST /api/ask` | Assistant IA (Claude + tools) |
| `POST /api/mcp` / `GET /api/mcp` | Endpoint MCP (clients Claude Desktop) |

### Helpers partagés (`src/lib/`)

- `breakdown.ts` — `runStatusBreakdown()` : ventilation des taxons par
  code de statut, utilisé par `/api/ask` ET `/api/mcp`.
- `heuristics.ts` — `looksLikeSpeciesName()` : détecte si une question
  est juste un nom d'espèce → fast-path direct sans appel LLM.
- `logger.ts` — instance pino mutualisée.

---

## 5. Assistant IA (`POST /api/ask`)

C'est la partie la plus dynamique. Flux :

```
        question utilisateur
                │
                ▼
   ┌────────────────────────────┐
   │ Validation Zod             │  ← question ≤ 500 car.
   │  (questionnent + history)  │     history ≤ 10 msgs
   └──────────────┬─────────────┘
                  │
       ┌──────────┴──────────┐
       │                     │
  looksLikeSpeciesName?  Non sinon
       │ Oui                 │
       ▼                     ▼
  ┌─────────┐         ┌────────────────────┐
  │ Lookup  │         │ Claude Sonnet 4.6  │
  │ direct  │         │  + 3 tools         │
  │ Postgres│         │  (timeout 30 s)    │
  └────┬────┘         └─────────┬──────────┘
       │                        │
       │   ┌────────────────────┤
       │   │                    │
       │   ▼                    ▼
       │ query_taxa /     status_breakdown
       │ get_interactions
       │   │
       └───┴───► réponse JSON
```

**Tools exposés à Claude** :
- `query_taxa` — filtres sur taxonomie, statuts, habitat, territoire.
- `status_breakdown` — agrégation par code de statut.
- `get_interactions` — interactions GloBI d'une espèce.

**Erreurs Anthropic** : timeout → 504, autre → 502, avec un message
français de repli. `lastQueryResult` est conservé pour qu'un éventuel
échec en milieu de boucle préserve les résultats déjà obtenus.

---

## 6. Intégrations externes

| Service | Usage | Particularités |
|---|---|---|
| **Anthropic (Claude)** | Assistant `/api/ask` | Appelé via le **proxy AI Integrations de Replit** — pas de clé Anthropic à gérer, la facturation passe par Replit. Wrapper `lib/integrations-anthropic-ai`, timeout 30 s |
| **GloBI** | `/api/taxons/:cdNom/interactions` | Cache mémoire 1 h avec `X-Cache: HIT/MISS`, timeout 10 s, mapping cdNom ↔ nom scientifique |
| **Wikipedia REST** | `/api/taxons/:cdNom/wikipedia` | Fallback FR → EN, cache HTTP `Cache-Control: max-age=3600` |
| **Wikimedia Commons** | `/api/taxons/:cdNom/media` | Recherche d'images, proxy via `/api/image-proxy` pour contourner CORS |
| **GBIF Species API** | `/api/taxons/:cdNom/gbif` | Matching + statut UICN + comptage d'occurrences |

Aucune clé d'API externe sensible n'est exposée au client : tous les
appels sortants sont faits côté serveur.

---

## 7. Frontend (`artifacts/taxref-explorer`)

React 19 + Vite 7, routing par `wouter`, état serveur par
`@tanstack/react-query`, UI shadcn/ui + Tailwind.

### Pages (`src/pages/`)

| Route | Composant | Rôle |
|---|---|---|
| `/` | `home.tsx` | Recherche + chat IA + treemap taxonomique |
| `/taxon/:slug` | `taxon.tsx` | Fiche détaillée (statuts, interactions, Wikipedia, médias) |
| `/taxonomie` | `taxonomie.tsx` | Exploration par règne |
| `/a-propos` | `about.tsx` | Crédits |
| catch-all | `not-found.tsx` | 404 |

### Composants transverses (`src/components/`)

- `Layout.tsx` — header (logo, badge BETA), footer (logos PatriNat,
  Natural Solutions, GloBI).
- `ConversationalBar.tsx` — UI du chat (textarea + envoi vers `/api/ask`).
- `SearchAutocomplete.tsx` — recherche typeahead (`/api/taxons/search`).
- `TaxonomyTreemap.tsx` — visualisation drill-down 5 niveaux.
- `ui/` — composants shadcn/ui.

### Communication avec l'API

Le client React Query est généré par Orval depuis l'OpenAPI dans
`lib/api-spec/`. Chaque hook (`useGetTaxon`, `useSearchTaxons`…) gère
cache, retry et état de chargement. Les routes non incluses dans le
spec OpenAPI (assistant, interactions) sont appelées via `fetch()`
directement.

---

## 8. Sécurité

Récapitulatif des contre-mesures actives :

| Vecteur | Mitigation |
|---|---|
| XSS sur citations BdC | `sanitizeCitation()` via `DOMParser.parseFromString()` (document inerte) + allowlist de tags |
| Injection SQL | 100 % des requêtes via le template `sql` de Drizzle (paramétrées). Le seul `sql.raw` est limité à des noms de colonne de liste blanche statique |
| CORS overscope | Allowlist regex ancrée, parsing `URL().host` (pas de spoofing par préfixe) |
| DoS (gros payload) | `express.json({ limit: "100kb" })` |
| DoS (LLM lent) | Timeout 30 s sur Anthropic |
| DoS (GloBI lent) | Timeout 10 s + cache mémoire 1 h |
| Inputs invalides sur `/api/ask` | Validation Zod stricte → 400 avec détails |
| Fuite d'info privée | Aucune (scan HoundDog : 0 finding) |
| CVE des dépendances | `pnpm update` régulier (audit : 0 vulnérabilité au moment de la rédaction) |

---

## 9. Tests

- **Unit (Vitest, dans `artifacts/api-server`)** :
  - `src/lib/heuristics.test.ts` — 15 tests sur la fast-path heuristic.
  - `src/lib/cors.test.ts` — 7 tests sur l'allowlist CORS.
  - `src/routes/ask.zod.test.ts` — 11 tests sur la validation Zod.
  - Total : **41 tests**, exécution < 1 s.
- **End-to-end** : Playwright via la skill `runTest()` (à la demande).

---

## 10. Build & déploiement

| Commande | Effet |
|---|---|
| `pnpm --filter @workspace/api-server run dev` | Build esbuild + lance le serveur (workflow Replit) |
| `pnpm --filter @workspace/taxref-explorer run dev` | Vite dev server (workflow Replit) |
| `pnpm --filter @workspace/api-server run test` | Lance Vitest |
| `pnpm typecheck` | Typecheck monorepo complet |
| `pnpm build` | Build production |

Le déploiement passe par la fonction "Publish" de Replit : chaque
artefact est servi sous son `previewPath` propre via le proxy partagé.

---

## 11. Choix d'architecture notables

- **Pas d'authentification** — application 100 % publique en lecture
  seule, donc pas de session, pas de cookies sensibles, pas de CSRF.
- **Pas d'ORM côté frontend** — le client React Query consomme un
  contrat OpenAPI typé via Orval, ce qui évite de dupliquer les types.
- **Cache mémoire pour GloBI** — l'API tierce est lente et le payload
  est lourd. Un cache simple (Map + TTL) suffit largement à l'échelle
  d'un seul nœud Replit.
- **Fast-path sans LLM** — la majorité des requêtes au chat sont en
  réalité des recherches d'espèces. La détection heuristique
  (`looksLikeSpeciesName`) court-circuite Claude pour ces cas, ce qui
  réduit la latence (~300 ms vs. 2-3 s) et le coût.
- **MCP exposé** — le serveur expose aussi un endpoint MCP qui rend
  `query_taxa` et `status_breakdown` consommables par Claude Desktop ou
  d'autres clients MCP.
