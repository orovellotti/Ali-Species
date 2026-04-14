import { Layout } from "@/components/Layout";
import { ExternalLink } from "lucide-react";
import { Helmet } from "react-helmet-async";
import patrinatLogo from "@/assets/images/logo-patrinat-official.png";
import nsLogo from "@/assets/images/logo-natural-solutions-official.png";

export default function About() {
  return (
    <Layout>
      <Helmet>
        <title>A propos – ALI Species</title>
        <meta name="description" content="ALI Species (All Life Intelligence) est une application web pour explorer le referentiel taxonomique national TAXREF v18. Produit par PatriNat, developpe par Natural Solutions." />
        <meta property="og:title" content="A propos – ALI Species" />
        <meta property="og:description" content="ALI Species (All Life Intelligence) est une application web pour explorer le referentiel taxonomique national TAXREF v18." />
      </Helmet>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-8">
          A propos
        </h1>

        <div className="space-y-10">
          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-foreground">ALI Species</h2>
            <p className="text-sm text-muted-foreground/70 italic mb-2">All Life Intelligence</p>
            <p className="text-muted-foreground leading-relaxed">
              ALI Species est une application web permettant d'explorer le referentiel taxonomique national francais (TAXREF). Elle offre une interface intuitive pour rechercher, consulter et naviguer parmi les taxons recenses en France.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              L'application permet de rechercher des taxons par nom scientifique ou nom vernaculaire, de visualiser la classification hierarchique complete, et de consulter les images associees depuis Wikipedia et Wikimedia Commons.
            </p>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-serif font-semibold text-foreground">TAXREF v18</h2>
            <p className="text-muted-foreground leading-relaxed">
              TAXREF est le referentiel taxonomique national pour la faune, la flore et la fonge de France metropolitaine et d'outre-mer. Il est la reference pour la denomination et la classification des especes dans les programmes nationaux de connaissance et de conservation de la biodiversite.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Cette application utilise la version 18 de TAXREF, la derniere version disponible du referentiel.
            </p>
            <a 
              href="https://inpn.mnhn.fr/accueil/recherche-de-donnees/taxref" 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
            >
              Consulter TAXREF sur le site de l'INPN
              <ExternalLink className="w-4 h-4" />
            </a>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-serif font-semibold text-foreground">PatriNat</h2>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <a href="https://www.patrinat.fr/" target="_blank" rel="noreferrer" className="shrink-0 hover:opacity-80 transition-opacity">
                <img src={patrinatLogo} alt="PatriNat" className="w-40 object-contain" />
              </a>
              <div className="space-y-4">
                <p className="text-muted-foreground leading-relaxed">
                  TAXREF est produit par <strong className="text-foreground">PatriNat</strong> (OFB - MNHN - CNRS - IRD), le centre d'expertise et de donnees sur le patrimoine naturel. PatriNat assure des missions d'expertise et de gestion des connaissances pour ses tutelles au benefice des politiques publiques et de la recherche en biodiversite.
                </p>
                <a 
                  href="https://www.patrinat.fr/" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                >
                  Visiter le site de PatriNat
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-serif font-semibold text-foreground">Natural Solutions</h2>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <a href="https://www.natural-solutions.eu/" target="_blank" rel="noreferrer" className="shrink-0 hover:opacity-80 transition-opacity">
                <img src={nsLogo} alt="Natural Solutions" className="w-36 object-contain" />
              </a>
              <div className="space-y-4">
                <p className="text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Natural Solutions</strong> est une entreprise specialisee dans le developpement de solutions numeriques au service de la biodiversite et de l'environnement. Elle accompagne les acteurs de la conservation dans la gestion et la valorisation de leurs donnees naturalistes.
                </p>
                <a 
                  href="https://www.natural-solutions.eu/" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                >
                  Visiter le site de Natural Solutions
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </section>

          <section className="p-8 rounded-2xl bg-primary/5 border border-primary/20 space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-foreground">Soutenez le projet</h2>
            <p className="text-muted-foreground leading-relaxed">
              ALI Species est un projet open source dedie a la valorisation de la biodiversite francaise. Pour continuer a developper de nouvelles fonctionnalites, ameliorer l'experience utilisateur et enrichir les donnees disponibles, nous avons besoin de votre soutien.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Que vous soyez une institution publique, une collectivite, une association naturaliste ou une entreprise engagee pour l'environnement, vous pouvez participer au financement et au developpement d'ALI Species.
            </p>
            <a
              href="https://www.natural-solutions.eu/contact"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors mt-2"
            >
              Contactez Natural Solutions
              <ExternalLink className="w-4 h-4" />
            </a>
          </section>

          <section className="space-y-4 pt-6 border-t border-border">
            <h2 className="text-2xl font-serif font-semibold text-foreground">Sources des donnees</h2>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>
                  <strong className="text-foreground">Taxonomie :</strong> TAXREF v18, produit par PatriNat, diffuse par l'
                  <a href="https://inpn.mnhn.fr/" target="_blank" rel="noreferrer" className="text-primary hover:underline">INPN</a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>
                  <strong className="text-foreground">Images :</strong> Wikipedia et Wikimedia Commons (licence libre)
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </Layout>
  );
}
