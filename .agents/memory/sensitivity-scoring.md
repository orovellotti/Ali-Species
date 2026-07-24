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

**OBSOLÈTE (ancien comportement, retiré)** : le score de patrimonialité
plafonnait à 0 pour une EEE. Ce plafond a été SUPPRIMÉ — la patrimonialité ne
prend plus du tout en compte l'EEE, et l'envahissement a son propre score
séparé (voir section "Score d'envahissement SÉPARÉ (EEE)" plus bas). Le cas
Agave vivipara sort désormais à 0 non pas par plafond mais parce qu'elle n'a
aucun statut national de conservation (LRM/LRE exclues du scope).

## Scope territorial de l'axe écologique (Liste rouge)

`computeSensitivity(statuts, scope)` prend un scope :
- **national** (défaut, interface + profile + share) : SEULE la Liste rouge
  nationale (LRN) alimente l'axe écologique. La mondiale (LRM) et l'européenne
  (LRE) sont TOUJOURS exclues du score de patrimonialité.
- **{ region }** (API MCP `get_statuts`, param `region`) : LRN (socle) + Liste
  rouge régionale (LRR) dont `lb_adm_tr` correspond à la région demandée.
**Why:** l'utilisateur veut que l'interface reflète le niveau France (national),
et que le régional soit accessible uniquement via l'API en passant une région.
Une menace régionale (ex. Lutra CR en Alsace) ne doit plus gonfler le score
national. Les drivers Liste rouge sont eux aussi filtrés par scope (on n'affiche
pas un badge LRM/LRR hors scope à côté d'un score qui l'ignore).
**How to apply:** régions dans `lb_adm_tr` (ex. "Alsace", "Corse", "Occitanie").
Match insensible à la casse/espaces. À répliquer client + serveur.

## Score d'envahissement SÉPARÉ (EEE)

L'ancien plafond EEE (patrimonialité forcée à 0 si REGLII/REGLLUTTE) a été
RETIRÉ. La patrimonialité mesure la valeur de conservation, point. Les espèces
exotiques envahissantes ont un score DISTINCT (`computeInvasiveness` client /
`computeInvasivenessServer` serveur), 0-100, jamais mélangé au score de
patrimonialité. **Why:** l'utilisateur veut deux axes séparés (valeur de
conservation vs enjeu de gestion) qui ne se mélangent pas.
Base : REGLLUTTE (lutte, code EEEUE = UE) = 0.8-0.9 ; REGLII (interdiction,
FRnoEEE* = métropole) = 0.55-0.7 ; bonus étendue = nb de territoires réglementés.
**How to apply:** exposé par MCP `get_statuts` (champ `envahissement`) et affiché
en widget rose sous la patrimonialité (front calcule en local depuis statuts).
Le profile/OpenAPI ne porte PAS l'envahissement (front local suffit). À répliquer
client + serveur.

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
