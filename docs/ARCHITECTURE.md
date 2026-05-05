# Comment fonctionne ALI Species

> Un site web qui permet d'explorer toutes les espèces vivantes
> recensées en France (environ **708 000 espèces** : animaux, plantes,
> champignons…), avec leurs statuts de protection, leurs interactions
> avec d'autres espèces, et un assistant qui répond aux questions en
> français.

Ce document explique en termes simples comment l'application est
construite. Pas besoin d'être informaticien pour le lire.

---

## 1. À quoi ressemble l'application ?

Imaginez trois grandes briques qui discutent entre elles :

```
   ┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
   │  Le navigateur  │ ◄────► │  Le serveur ALI  │ ◄────► │ Les sources │
   │ (ce que vous    │         │ (le « cerveau ») │         │ de données  │
   │  voyez à l'écran)│         │                  │         │ (Wikipedia, │
   └─────────────────┘         └──────────────────┘         │  GBIF, …)   │
                                       │                    └─────────────┘
                                       ▼
                                ┌─────────────┐
                                │ Notre base  │
                                │ de données  │
                                │ (708 000    │
                                │  espèces)   │
                                └─────────────┘
```

1. **Le navigateur** affiche les pages, la barre de recherche, les
   fiches d'espèces, etc.
2. **Le serveur** est le chef d'orchestre : il reçoit les questions du
   navigateur, va chercher les bonnes informations dans notre base de
   données ou auprès des sites partenaires, puis renvoie une réponse
   propre.
3. **Les sources externes** (Wikipedia, GBIF, GloBI…) enrichissent les
   données françaises avec des photos, des descriptions, des
   interactions entre espèces, etc.

---

## 2. D'où viennent les données ?

Toutes les données scientifiques viennent de **fichiers officiels**
publiés par le Muséum national d'Histoire naturelle :

- **TAXREF v18** — la liste de référence des espèces de France
  (≈ 708 000 lignes : nom scientifique, nom français, classification,
  habitat, etc.).
- **BdC Statuts v18** — les statuts juridiques et de conservation de
  ces espèces (≈ 447 000 entrées : Liste Rouge UICN, espèces
  protégées, directives européennes, etc.).

Ces fichiers sont chargés **une seule fois**, au moment de
l'installation, dans notre base de données interne. Le site lui-même
ne modifie jamais ces données : il se contente de les **lire** très
rapidement pour les afficher.

---

## 3. Ce qu'on peut faire sur le site

| Page | Ce qu'on y trouve |
|---|---|
| **Accueil** | Une barre de recherche, l'assistant en français, et une visualisation interactive de l'arbre du vivant |
| **Fiche d'une espèce** | Tout ce qu'on sait sur cette espèce : photos, description Wikipedia, statuts de protection, traits biologiques, espèces avec lesquelles elle interagit, liens vers GBIF et l'INPN |
| **Taxonomie** | Exploration par grandes catégories (animaux, plantes, champignons…) |
| **Sources** | Liste des bases de données utilisées avec leurs citations |
| **Export (Open Data)** | Téléchargement du graphe complet au format RDF (Turtle) et endpoint SPARQL pour les chercheurs et les outils de données liées |
| **À propos** | Crédits et remerciements (PatriNat, Natural Solutions, GloBI) |

---

## 4. L'assistant en français

C'est la partie la plus « intelligente » du site. Quand vous tapez une
question dans la barre de chat, voici ce qui se passe :

```
   « Combien d'oiseaux protégés en Bretagne ? »
                    │
                    ▼
   ┌──────────────────────────────────────┐
   │ Le serveur regarde la question :     │
   │   • simple nom d'espèce ?            │
   │     → réponse directe (très rapide)  │
   │   • vraie question ?                 │
   │     → on demande à Claude            │
   └─────────────────┬────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │   Claude    │  ← l'IA d'Anthropic
              │  (Sonnet)   │     qu'on consulte
              └──────┬──────┘     en arrière-plan
                     │
        Claude a le droit de demander :
          • « cherche-moi des espèces avec ces critères »
          • « ventile-les par statut de protection »
          • « donne-moi les interactions de cette espèce »
                     │
                     ▼
              Réponse en français
```

**Bon à savoir** : il n'y a **pas de clé d'API à fournir**. Claude est
appelé via le service d'intégrations IA de Replit, donc tout est déjà
configuré et la facturation est gérée par Replit.

Pour les questions très simples (par exemple taper juste « Vulpes
vulpes » ou « renard »), le serveur reconnaît qu'il s'agit d'un nom
d'espèce et répond directement, **sans appeler Claude** : c'est plus
rapide et ça coûte moins cher.

---

## 5. Les sources externes utilisées

| Source | Ce qu'elle nous apporte |
|---|---|
| **Wikipedia** (FR puis EN) | Une description grand public de l'espèce |
| **Wikimedia Commons** | Les photos des espèces |
| **GBIF** | Le nombre d'observations dans le monde et le statut UICN mondial |
| **GloBI** | Les interactions entre espèces (qui mange qui, qui pollinise quoi, qui parasite qui) |
| **Wikidata** | Les identifiants croisés et les liens vers d'autres bases scientifiques |
| **PanTHERIA, AVONET, AmphiBIO** | Les traits biologiques (taille, poids, régime alimentaire…) pour les mammifères, oiseaux et amphibiens |
| **Claude** (via Replit) | Le moteur de l'assistant en langage naturel |

Toutes ces sources sont appelées **côté serveur**. Votre navigateur ne
parle qu'à notre serveur, jamais directement à ces sites tiers.

---

## 6. La sécurité, en bref

Même si le site est public et en lecture seule (on ne peut rien y
publier), plusieurs protections sont en place :

- **Pas de comptes utilisateurs** → pas de mots de passe à protéger,
  pas de risque de fuite de données personnelles.
- **Filtrage des contenus venant des bases scientifiques** pour éviter
  qu'un texte malveillant glissé dans une citation puisse exécuter du
  code dans votre navigateur.
- **Limite sur la taille des questions** envoyées au serveur (pour
  éviter qu'on essaye de le saturer).
- **Limite de temps** sur les appels à Claude (30 secondes maximum) et
  à GloBI (10 secondes), pour que le site reste réactif même si un
  service externe est lent.
- **Liste blanche** des sites autorisés à utiliser notre serveur (les
  domaines Replit et le développement local uniquement).
- **Mise à jour régulière** des bibliothèques pour corriger les failles
  connues.

---

## 7. Comment c'est organisé en interne

Le code est rangé en plusieurs **dossiers**, chacun avec un rôle clair :

```
workspace/
├── artifacts/                  ← les applications qui tournent
│   ├── api-server/             ← le serveur (le « cerveau »)
│   └── taxref-explorer/        ← le site web (ce que vous voyez)
├── lib/                        ← briques partagées entre les apps
│   ├── db/                     ← l'accès à la base de données
│   ├── rdf-vocab/              ← les vocabulaires standards (DwC,
│   │                              SKOS, OWL…) pour la publication
│   │                              des données ouvertes
│   ├── api-zod/ + api-client-react/  ← les outils générés
│   │                              automatiquement pour relier
│   │                              le serveur et le site
│   └── integrations-anthropic-ai/  ← le pont vers Claude
├── scripts/                    ← imports de données + génération
│                                  du dump RDF
├── exports/                    ← les fichiers RDF publiés et la
│                                  base Oxigraph locale
└── docs/                       ← cette documentation
```

Les deux briques principales :

- **api-server** — le serveur qui reçoit les requêtes et répond avec
  des données.
- **taxref-explorer** — le site web que voient les visiteurs.

Les autres dossiers (`lib/`) contiennent des outils utilisés par les
deux côtés (par exemple, le schéma de la base de données est défini
une seule fois et utilisé partout).

---

## 8. Choix importants qu'on a faits

- **Site 100 % public et en lecture seule.** Personne ne peut modifier
  les données depuis le site. Cela simplifie énormément la sécurité.
- **Tout passe par notre serveur.** Le navigateur ne contacte jamais
  Wikipedia, GBIF ou Claude directement. Cela évite les problèmes de
  blocage entre sites et nous permet de garder en cache les réponses.
- **Cache pour les services lents.** Les réponses de GloBI sont
  conservées en mémoire pendant une heure : si deux personnes
  consultent la même espèce, la deuxième voit la page s'afficher
  instantanément.
- **Raccourci sans IA pour les recherches simples.** Quand on devine
  qu'il s'agit juste d'un nom d'espèce, on évite d'appeler Claude.
- **Compatibilité avec les outils IA externes.** Le serveur expose
  aussi un point d'entrée « MCP » qui permet à des applications comme
  Claude Desktop d'interroger directement notre base d'espèces.
- **Données ouvertes (Open Data, licence CC-BY 4.0).** Tout le graphe
  (taxonomie + statuts + traits + interactions + liens Wikidata) est
  publié au format RDF (Turtle). Voir la section ci-dessous.

---

## 8 bis. Open Data — RDF et SPARQL

Le site propose une page **/export** dédiée à la communauté
scientifique et aux outils du web sémantique. On y trouve :

- un **fichier de téléchargement unique** (~103 Mo compressé) qui
  contient les **17 millions de faits** du graphe au format Turtle —
  un format standard que tous les outils de données liées savent lire ;
- un **endpoint SPARQL** (un langage d'interrogation pour les graphes
  de connaissances) avec une interface visuelle (YASGUI) pour tester
  des requêtes ;
- les statistiques de production du dump (nombre de taxons, statuts,
  triplets, etc.) au format CSV.

```
   ┌─────────────────────┐    publication    ┌──────────────────────┐
   │ Notre base PostgreSQL│ ─────────────────▶│ ali-species-<id>.    │
   │ + caches GloBI/Wiki  │   (script RDF)    │ ttl.gz   (~103 Mo)   │
   └─────────────────────┘                    └──────────┬───────────┘
                                                         │
                              ┌──────────────────────────┴──────────────┐
                              ▼                                         ▼
                     ┌────────────────┐                         ┌─────────────┐
                     │  Téléchargement │                         │  Oxigraph    │
                     │  direct (page  │                         │ (triplestore │
                     │   /export)     │                         │  local)      │
                     └────────────────┘                         └──────┬──────┘
                                                                       │
                                                                       ▼
                                                                 SPARQL queries
```

**Dégradation gracieuse en production.** L'endpoint SPARQL public
nécessite un serveur dédié (Oxigraph) qui n'est pas démarré sur le
déploiement « autoscale » par défaut. Dans ce cas, la page /export
détecte l'absence du service et affiche à la place un encart
expliquant comment **lancer Oxigraph en local en 30 secondes** à
partir du fichier téléchargé. Le téléchargement, lui, reste toujours
disponible.

**Astuce technique sur le bouton de téléchargement.** Quand l'app est
visualisée dans la prévisualisation Replit (qui l'embarque dans une
iframe), un simple lien `<a href>` vers un gros fichier est intercepté
par le wrapper et donne un fichier de 0 octet. Le bouton utilise donc
`window.open()` programmatique pour ouvrir une vraie fenêtre top-level,
ce qui contourne ce souci.

---

## 9. Comment lancer le projet en développement

| Pour faire ça… | …on utilise cette commande |
|---|---|
| Lancer le serveur | il démarre tout seul (workflow Replit) |
| Lancer le site | il démarre tout seul (workflow Replit) |
| Lancer les tests automatiques | `pnpm --filter @workspace/api-server run test` |
| Vérifier qu'il n'y a pas d'erreurs de code | `pnpm typecheck` |

La mise en ligne (le « publier ») est gérée par le bouton **Publish**
de Replit. Une fois publié, le site est accessible sur une adresse
`.replit.app`.

---

## 10. Tests

Pour s'assurer que rien ne casse au fil des modifications, **41 tests
automatiques** vérifient en moins d'une seconde :

- que la détection « est-ce que c'est juste un nom d'espèce ? »
  fonctionne bien (15 tests),
- que la liste des sites autorisés à parler au serveur est correcte
  (7 tests),
- que les questions envoyées à l'assistant sont bien validées avant
  d'être traitées (11 tests),
- + d'autres petits contrôles.

En complément, des tests « bout en bout » peuvent être lancés à la
demande pour simuler un vrai utilisateur qui clique sur le site.

---

*Document destiné au grand public. Pour la version technique détaillée
(noms de fichiers, signatures de fonctions, etc.), se référer
directement au code source ou demander à un développeur.*
