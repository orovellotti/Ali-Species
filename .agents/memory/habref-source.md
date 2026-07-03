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
