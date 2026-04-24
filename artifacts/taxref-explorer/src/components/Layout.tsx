import { Link } from "wouter";
import aliLogo from "@/assets/images/ali-logo.png";
import nsLogo from "@/assets/images/logo-natural-solutions-official.png";
import patrinatLogo from "@/assets/images/logo-patrinat-official.png";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group transition-opacity hover:opacity-80">
            <img src={aliLogo} alt="ALI Species" className="w-8 h-8" />
            <div className="flex flex-col leading-tight">
              <span className="font-serif font-semibold text-lg tracking-tight">ALI Species</span>
              <span className="text-[10px] text-muted-foreground tracking-widest uppercase">All Life Intelligence</span>
            </div>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Accueil</Link>
            <Link href="/taxonomie" className="hover:text-foreground transition-colors" data-testid="link-taxonomie">Taxonomie</Link>
            <Link href="/a-propos" className="hover:text-foreground transition-colors">A propos</Link>
            <Link
              href="/a-propos#mcp"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
              data-testid="link-mcp-header"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider">MCP</span>
              <span className="text-xs">API</span>
            </Link>
          </nav>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="py-10 border-t border-border bg-card/50 mt-auto">
        <div className="container mx-auto px-4 space-y-6">
          <div className="flex items-center justify-center gap-10 flex-wrap">
            <a href="https://www.natural-solutions.eu/" target="_blank" rel="noreferrer" className="block hover:opacity-80 transition-opacity">
              <img 
                src={nsLogo} 
                alt="Natural Solutions" 
                className="h-12 object-contain"
              />
            </a>
            <a href="https://www.patrinat.fr/" target="_blank" rel="noreferrer" className="block hover:opacity-80 transition-opacity">
              <img 
                src={patrinatLogo} 
                alt="PatriNat" 
                className="h-14 object-contain"
              />
            </a>
          </div>

          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Donnees issues du referentiel taxonomique national{" "}
              <a href="https://inpn.mnhn.fr/accueil/recherche-de-donnees/taxref" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">TAXREF v18</a>
            </p>
            <p className="text-sm text-muted-foreground">
              TAXREF est produit par{" "}
              <a href="https://www.patrinat.fr/" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">PatriNat</a>
              {" "}(OFB - MNHN - CNRS - IRD), centre d'expertise et de donnees sur le patrimoine naturel.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 pt-4">
            <p className="text-sm text-muted-foreground text-center max-w-xl">
              Une idee de projet autour de la biodiversite, de la donnee naturaliste ou du vivant&nbsp;?
            </p>
            <a
              href="https://www.natural-solutions.eu/contact"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-full transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            >
              Contactez Natural Solutions
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>

          <div className="flex items-center justify-center gap-6 pt-2 border-t border-border/50">
            <a href="https://www.natural-solutions.eu/" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
              Natural Solutions
            </a>
            <span className="text-muted-foreground/30">|</span>
            <a href="https://inpn.mnhn.fr/" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
              INPN
            </a>
            <span className="text-muted-foreground/30">|</span>
            <a href="https://www.patrinat.fr/" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
              PatriNat
            </a>
          </div>

          <p className="text-xs text-muted-foreground/60 text-center">
            Images fournies par Wikipedia et Wikimedia Commons.
          </p>
        </div>
      </footer>
    </div>
  );
}
