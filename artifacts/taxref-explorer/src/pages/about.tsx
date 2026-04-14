import { Layout } from "@/components/Layout";
import { ExternalLink } from "lucide-react";
import patrinatLogo from "@/assets/images/logo-patrinat-official.png";
import nsLogo from "@/assets/images/logo-natural-solutions-official.png";

export default function About() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-8">
          A propos
        </h1>

        <div className="space-y-10">
          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-foreground">ALi species</h2>
            <p className="text-muted-foreground leading-relaxed">
              ALi species est une application web permettant d'explorer le referentiel taxonomique national francais (TAXREF). Elle offre une interface intuitive pour rechercher, consulter et naviguer parmi les taxons recenses en France.
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
