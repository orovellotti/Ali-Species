---
name: HABREF as offline species→habitat source
description: What HABREF (PatriNat/MNHN) contains and its limits for the "milieux" feature vs the live EUNIS crawl
---

# HABREF — source bulk offline espèce↔habitat

Source: `https://assets.patrinat.fr/files/referentiel/HABREF.zip` (nested zip → `HABREF_07/`). ~28 Mo. Version 7.0 (HABREF_70).

## Ce qu'il contient d'utile
- `HABREF_CORRESP_TAXON_70.csv` : ~100 648 lignes reliant `CD_HAB_ENTRE` (code habitat) ↔ `CD_NOM` (= cd_nom TAXREF, **jointe directe** à notre table `taxons`). ~14 700 cd_nom distincts.
- `HABREF_70.csv` : typologies d'habitats. Colonne `CD_TYPO` identifie la typologie ; la plus utilisée dans CORRESP_TAXON est EUNIS (codes A1.x/A3.x marins EUNIS), ce qui s'aligne avec notre feature EUNIS existante.

## Couverture (jointure contre `taxons`)
- Plantae 8 742, Animalia 5 443 (dont Aves 319, Actinopterygii 189, Mammalia 69, Amphibia 35, + bcp d'invertébrés marins), Chromista 168, Fungi 96.
- Spot-check présents : goéland leucophée (199374), salamandre tachetée, grenouille rousse, milan royal. ABSENTS : cerf élaphe, renard roux → couverture vertébrés **partielle**.

## Limites / pièges
- **Sémantique différente** de notre EUNIS actuel : HABREF = « espèce caractéristique/liée à tel type d'habitat » (surtout phytosociologie végétale), direction habitat→espèce. Notre feature EUNIS donne breeding/wintering/preferred par espèce. Complémentaire, pas identique.
- CSV avec champs multi-lignes et `;` internes (descriptions) → **parseur CSV réel obligatoire**, pas de split naïf (awk/cut se décalent).
- HABREF référence des cd_nom pouvant être synonymes ; joindre en tenant compte de `cd_ref`.

**Why:** évaluer les sources bulk pour remplir les milieux sans crawler EUNIS (~10s/espèce, throttlé). HABREF évite le crawl pour les espèces couvertes mais ne remplace pas EUNIS sur la sémantique ni sur les vertébrés courants.

## Décisions d'intégration (retenues)
- Section UI **séparée** « Habitats associés (HABREF) », distincte de la section EUNIS scrapée : les deux coexistent car la relation diffère (caractéristique-de vs habitat-de-vie). Ne pas les fusionner.
- On n'expose **que la typologie EUNIS** de HABREF (`CD_TYPO='7'` ; codes racine = lettres EUNIS A..J). Extensible aux autres typologies (CORINE = typo 4, etc.) plus tard sans re-import.
- Stockage bulk offline dans table dédiée clé `cd_ref` (jsonb `habitats`), lecture directe en DB par le profile (pas de cache external). Jointure d'import cd_nom→cd_ref via `taxons`.
- **Import atomique obligatoire** : le `DELETE` + réinsertion doit être dans une transaction (BEGIN/COMMIT/ROLLBACK) et refuser d'écrire si 0 ligne parsée — sinon un run échoué vide la table. Valider aussi la présence des colonnes CSV (fail-fast si l'en-tête HABREF change).
- **Why:** un bloc de référence offline ne doit jamais tomber en état vide/partiel après un run raté, et une dérive du format HABREF amont doit planter explicitement, pas filtrer silencieusement.

## PROD — pas encore fait
Le déploiement prod nécessite : push du schéma (créer `habref_habitats` en prod), run de l'import contre la DB prod, puis purge cache (`POST /api/admin/cache/clear`, header `x-admin-token`). executeSql prod = READ-ONLY.
