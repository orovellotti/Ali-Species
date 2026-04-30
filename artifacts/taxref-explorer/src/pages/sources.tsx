import { Layout } from "@/components/Layout";
import { Link } from "wouter";
import { BookOpen, ExternalLink } from "lucide-react";

type Source = {
  id: string;
  name: string;
  description: string;
  publisher: string;
  license: string;
  url: string;
  urlLabel: string;
  citation: string;
};

const SOURCES: Source[] = [
  {
    id: "taxref",
    name: "TAXREF v18",
    description:
      "Référentiel taxonomique national pour la France métropolitaine et d'outre-mer. Fournit la hiérarchie complète (règne → embranchement → classe → ordre → famille → genre → espèce), les noms scientifiques et vernaculaires, ainsi que les statuts de présence pour environ 660 000 taxons. Toutes les fiches espèces de l'application reposent sur ce référentiel.",
    publisher: "INPN — UMS PatriNat (OFB / MNHN / CNRS / IRD)",
    license:
      "Licence Ouverte Etalab 2.0 (usage libre, y compris commercial, attribution requise).",
    url: "https://inpn.mnhn.fr/programme/referentiel-taxonomique-taxref",
    urlLabel: "inpn.mnhn.fr/…/taxref",
    citation:
      "Gargominy O., Tercerie S., Régnier C., Ramage T., Schoelinck C., Dupont P., Vandel E., Daszkiewicz P. & Poncet L. (2024). TAXREF v18, référentiel taxonomique pour la France. UMS PatriNat (OFB-MNHN-CNRS-IRD). Muséum national d'Histoire naturelle, Paris. Archive de téléchargement : https://inpn.mnhn.fr/telechargement/referentielEspece/taxref/18.0/menu",
  },
  {
    id: "bdc-statuts",
    name: "BdC Statuts v18",
    description:
      "Base de Connaissances « Statuts » : agrégation harmonisée de tous les statuts juridiques (protection nationale, régionale, départementale), réglementaires (espèces exotiques envahissantes, prélèvement, chasse, pêche), de menace (Listes rouges UICN nationale, régionales, mondiale et européenne) et conventionnels (directives Habitats et Oiseaux, conventions de Berne, Bonn, OSPAR, Barcelone) qui s'appliquent aux taxons de TAXREF. Source de la page « Statuts » et du baromètre de l'application.",
    publisher: "UMS PatriNat (OFB / MNHN / CNRS / IRD) — diffusion via INPN",
    license:
      "Licence Ouverte Etalab 2.0 (usage libre, y compris commercial, attribution requise).",
    url: "https://inpn.mnhn.fr/telechargement/referentielEspece/bdc-statuts-especes",
    urlLabel: "inpn.mnhn.fr/…/bdc-statuts-especes",
    citation:
      "UMS PatriNat (OFB-MNHN-CNRS-IRD) (2024). Base de Connaissances « Statuts » des espèces en France, version associée à TAXREF v18. Muséum national d'Histoire naturelle, Paris. Diffusion : INPN.",
  },
  {
    id: "lrn",
    name: "Liste rouge nationale (UICN)",
    description:
      "Évaluation, selon la méthodologie standardisée de l'UICN, du risque d'extinction de chaque espèce sauvage de France métropolitaine et d'outre-mer (catégories LC, NT, VU, EN, CR, RE, EW, EX, DD, NA, NE). Les pourcentages d'espèces menacées affichés dans le baromètre proviennent de cette source via les codes BdC Statuts (cd_type_statut = LRN).",
    publisher: "Comité français de l'UICN & Muséum national d'Histoire naturelle",
    license:
      "Données diffusées via l'INPN sous Licence Ouverte Etalab 2.0. Le rapport et les chapitres restent © UICN France & MNHN, citation requise.",
    url: "https://uicn.fr/liste-rouge-france/",
    urlLabel: "uicn.fr/liste-rouge-france",
    citation:
      "UICN France, MNHN, OFB et al. (2008-2024). La Liste rouge des espèces menacées en France — chapitres successifs (oiseaux, mammifères, amphibiens, reptiles, flore vasculaire, etc.). Paris.",
  },
  {
    id: "directive-habitats",
    name: "Directive Habitats-Faune-Flore (92/43/CEE)",
    description:
      "Directive européenne du 21 mai 1992 concernant la conservation des habitats naturels ainsi que de la faune et de la flore sauvages. Annexes II (espèces dont la conservation nécessite la désignation de zones spéciales de conservation), IV (espèces strictement protégées) et V (espèces dont le prélèvement peut faire l'objet de mesures de gestion). Codes utilisés dans le baromètre : CDH2, CDH4, CDH5.",
    publisher: "Conseil des Communautés européennes",
    license: "Texte réglementaire de l'Union européenne, libre d'accès.",
    url: "https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:01992L0043-20130701",
    urlLabel: "eur-lex.europa.eu/…/CELEX:01992L0043",
    citation:
      "Conseil des Communautés européennes (1992). Directive 92/43/CEE du 21 mai 1992 concernant la conservation des habitats naturels ainsi que de la faune et de la flore sauvages. Journal officiel L 206 du 22.7.1992.",
  },
  {
    id: "directive-oiseaux",
    name: "Directive Oiseaux (2009/147/CE)",
    description:
      "Directive européenne concernant la conservation des oiseaux sauvages, version codifiée de la directive originelle 79/409/CEE. Annexe I (espèces faisant l'objet de mesures spéciales de conservation et de désignation de Zones de Protection Spéciale), annexes II et III (chasse et commercialisation).",
    publisher: "Parlement européen et Conseil de l'Union européenne",
    license: "Texte réglementaire de l'Union européenne, libre d'accès.",
    url: "https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32009L0147",
    urlLabel: "eur-lex.europa.eu/…/CELEX:32009L0147",
    citation:
      "Parlement européen & Conseil (2009). Directive 2009/147/CE du 30 novembre 2009 concernant la conservation des oiseaux sauvages (version codifiée). Journal officiel L 20 du 26.1.2010.",
  },
  {
    id: "protection-nationale",
    name: "Protection nationale (Code de l'environnement)",
    description:
      "Arrêtés ministériels listant les espèces végétales et animales protégées sur l'ensemble du territoire national, pris en application des articles L.411-1 et L.411-2 du Code de l'environnement. Couvre la flore vasculaire, les mammifères, les oiseaux, les amphibiens, les reptiles, les insectes, les mollusques, etc. Code BdC : PN.",
    publisher: "Ministère chargé de la Transition écologique — Direction de l'eau et de la biodiversité",
    license: "Textes réglementaires français, libres d'accès via Légifrance.",
    url: "https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000006159399/",
    urlLabel: "legifrance.gouv.fr — Code de l'environnement, art. L.411-1",
    citation:
      "République française. Code de l'environnement, articles L.411-1 et L.411-2 et arrêtés d'application (arrêté du 29 octobre 2009 — oiseaux ; arrêté du 23 avril 2007 — mammifères ; arrêté du 19 novembre 2007 — reptiles & amphibiens ; arrêté du 20 janvier 1982 — flore ; etc.).",
  },
  {
    id: "znieff",
    name: "Espèces déterminantes ZNIEFF",
    description:
      "Listes établies par les Conseils Scientifiques Régionaux du Patrimoine Naturel (CSRPN) des espèces dont la présence justifie la désignation d'une Zone Naturelle d'Intérêt Écologique, Faunistique et Floristique (ZNIEFF de type I ou II). Outil de connaissance scientifique sans portée réglementaire directe. Code BdC : ZDET.",
    publisher: "CSRPN — DREAL — coordination MNHN",
    license: "Listes régionales publiées par chaque CSRPN ; diffusion via l'INPN.",
    url: "https://inpn.mnhn.fr/programme/inventaire-znieff/presentation",
    urlLabel: "inpn.mnhn.fr/…/inventaire-znieff",
    citation:
      "Horellou A., Dore A., Herard K., Siblet J.-Ph. (2013). Guide méthodologique pour l'inventaire continu des Zones Naturelles d'Intérêt Écologique, Faunistique et Floristique en milieu continental. MNHN-SPN, Paris.",
  },
  {
    id: "conventions-internationales",
    name: "Conventions internationales (Berne, Bonn, OSPAR, Barcelone)",
    description:
      "Conventions multilatérales auxquelles la France est partie : Convention de Berne (1979, espèces de la flore et de la faune sauvages d'Europe), Convention de Bonn (1979, espèces migratrices), Convention OSPAR (Atlantique nord-est) et Convention de Barcelone (Méditerranée). Codes BdC : BERN, BONN, OSPAR, BARC.",
    publisher: "Conseil de l'Europe (Berne) ; PNUE (Bonn, Barcelone) ; Commission OSPAR",
    license: "Textes des traités, libres d'accès.",
    url: "https://www.coe.int/fr/web/bern-convention",
    urlLabel: "coe.int/…/bern-convention",
    citation:
      "Conseil de l'Europe (1979). Convention relative à la conservation de la vie sauvage et du milieu naturel de l'Europe (STE n° 104). PNUE (1979). Convention sur la conservation des espèces migratrices appartenant à la faune sauvage. Bonn.",
  },
  {
    id: "globi",
    name: "GloBI — Global Biotic Interactions",
    description:
      "Base ouverte d'interactions interspécifiques (prédation, pollinisation, parasitisme, herbivorie, symbiose…) agrégeant des centaines d'études et de jeux de données. Source des relations écologiques affichées sur les fiches espèces de l'application.",
    publisher: "Jorrit H. Poelen et al.",
    license: "CC BY (attribution requise, usage commercial permis).",
    url: "https://www.globalbioticinteractions.org/",
    urlLabel: "globalbioticinteractions.org",
    citation:
      "Poelen J. H., Simons J. D. & Mungall C. J. (2014). Global Biotic Interactions: An open infrastructure to share and analyze species-interaction datasets. Ecological Informatics 24, 148-159. https://doi.org/10.1016/j.ecoinf.2014.08.005",
  },
  {
    id: "inpn",
    name: "INPN — Inventaire National du Patrimoine Naturel",
    description:
      "Plateforme nationale de référence pour la diffusion des données sur les espèces, les habitats et les espaces naturels protégés en France. Fournit en accès libre les jeux de données TAXREF, BdC Statuts, les listes d'espèces déterminantes, et de nombreuses ressources cartographiques utilisées par l'application.",
    publisher: "UMS PatriNat (OFB / MNHN / CNRS / IRD)",
    license: "Licence Ouverte Etalab 2.0 pour la majorité des jeux de données.",
    url: "https://inpn.mnhn.fr/",
    urlLabel: "inpn.mnhn.fr",
    citation:
      "INPN (2024). Inventaire National du Patrimoine Naturel. UMS PatriNat (OFB-MNHN-CNRS-IRD), Muséum national d'Histoire naturelle, Paris. https://inpn.mnhn.fr",
  },
  {
    id: "claude",
    name: "Anthropic Claude (modèle de langage)",
    description:
      "Modèle de langage utilisé pour la génération de descriptions vulgarisées et de synthèses textuelles à partir des données structurées issues des sources ci-dessus. Aucun contenu ne provient directement du modèle : toutes les valeurs (statuts, taxonomie, interactions) restent issues des bases scientifiques listées sur cette page.",
    publisher: "Anthropic, PBC",
    license: "API commerciale ; les sorties générées sont sous la responsabilité éditoriale d'ALI Species.",
    url: "https://www.anthropic.com/claude",
    urlLabel: "anthropic.com/claude",
    citation: "Anthropic (2024). Claude — modèle de langage. https://www.anthropic.com/claude",
  },
];

export default function Sources() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 md:py-16 max-w-3xl">
        {/* Breadcrumb */}
        <nav
          className="text-xs text-muted-foreground mb-6"
          aria-label="Fil d'Ariane"
        >
          <Link href="/" className="hover:text-foreground transition-colors">
            Accueil
          </Link>{" "}
          <span className="mx-1.5">/</span>{" "}
          <span className="text-foreground">Sources</span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-4">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4 leading-tight">
            Sources & citations
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-3">
            ALI Species agrège plusieurs jeux de données ouverts de référence
            sur la biodiversité française : référentiel taxonomique national,
            base de connaissance des statuts juridiques et de menace,
            interactions écologiques, et textes réglementaires européens et
            français. Chaque source est listée ci-dessous avec son éditeur, sa
            licence et la citation formelle à reprendre pour tout usage dérivé.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sur les fiches espèces et le baromètre de la page{" "}
            <Link
              href="/taxonomie"
              className="underline decoration-dotted hover:text-foreground"
            >
              Statuts
            </Link>
            , chaque chiffre renvoie aux jeux de données ci-dessous (TAXREF
            pour la taxonomie, BdC Statuts pour les pourcentages, GloBI pour
            les interactions).
          </p>
        </div>

        {/* Source cards */}
        <div className="space-y-5">
          {SOURCES.map((s) => (
            <article
              key={s.id}
              id={s.id}
              className="bg-background border border-border rounded-2xl p-5 md:p-6 shadow-sm scroll-mt-20"
              data-testid={`source-${s.id}`}
            >
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-foreground mb-3">
                {s.name}
              </h2>
              <p className="text-sm text-foreground/85 leading-relaxed mb-4">
                {s.description}
              </p>

              <dl className="grid grid-cols-[90px_1fr] sm:grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm mb-4">
                <dt className="text-muted-foreground">Éditeur</dt>
                <dd className="text-foreground">{s.publisher}</dd>

                <dt className="text-muted-foreground">Licence</dt>
                <dd className="text-foreground">{s.license}</dd>

                <dt className="text-muted-foreground">Lien</dt>
                <dd>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline break-all"
                  >
                    {s.urlLabel}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </dd>
              </dl>

              <pre className="bg-muted/40 border border-border/40 rounded-lg p-3 text-[11px] sm:text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono">
                {s.citation}
              </pre>
            </article>
          ))}
        </div>

        {/* Footer note */}
        <p className="mt-10 text-xs text-muted-foreground text-center italic">
          Une donnée vous semble incorrecte ou obsolète ? Signalez-le sur la
          page{" "}
          <Link
            href="/a-propos"
            className="underline decoration-dotted hover:text-foreground"
          >
            À propos
          </Link>
          .
        </p>
      </div>
    </Layout>
  );
}
