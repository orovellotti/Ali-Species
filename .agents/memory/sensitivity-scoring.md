---
name: Patrimonialité (ex-"sensibilité") scoring
description: How the conservation-value score is computed, and the client/server duplication gotcha
---

# Score de patrimonialité (valeur de conservation)

Le score affiché comme "Patrimonialité" (anciennement "sensibilité") agrège
UNIQUEMENT des axes patrimoniaux : `global = 0.5*ecological + 0.3*regulatory + 0.2*territorial`.
- ecological = meilleure catégorie Liste rouge (barème par code UICN)
- regulatory = max(protection, directive, convention)
- territorial = moyenne ZNIEFF/PNA présents

**Le caractère envahissant (EEE) est HORS score** : ce n'est pas une valeur
patrimoniale. Il reste exposé comme "driver"/badge informatif seulement.
**Why:** l'utilisateur a explicitement refusé de mélanger menace écologique,
réglementaire, territorial et gestion/EEE dans un seul score.

## Duplication client ↔ serveur (gotcha durable)

L'algo existe en DOUBLE, non partagé :
- client `artifacts/taxref-explorer/src/lib/sensitivity.ts` (canonique, avec classes Tailwind) — utilisé par la page taxon.
- serveur `artifacts/api-server/src/lib/sensitivityServer.ts` (sans Tailwind) — utilisé par le partage/OG, le cache profile, et le MCP `get_statuts`.

Toute modif de l'algo doit être répliquée dans les deux fichiers.

**Divergence connue non résolue** : la table `RED_LIST_SCORES` diffère entre les
deux (ex. CR 1.0 client vs 0.95 serveur ; LC 0.2 vs 0.05 ; DD/NA non nuls côté
client ; RE/CR* seulement serveur). Conséquence : un même taxon peut afficher un
score différent sur la page (client) vs sur les cartes de partage / MCP (serveur).
**How to apply:** si on unifie, extraire un module partagé (lib) pour le barème
ET la logique de scoring, puis choisir un seul jeu de valeurs (décision produit).
