import React from "react";
import { Link } from "wouter";
import { Leaf } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group transition-opacity hover:opacity-80">
            <div className="bg-primary/10 p-1.5 rounded-md text-primary">
              <Leaf className="w-5 h-5" />
            </div>
            <span className="font-serif font-semibold text-lg tracking-tight">TAXREF Explorer</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <a href="https://inpn.mnhn.fr/accueil/recherche-de-donnees/taxref" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">About TAXREF</a>
          </nav>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="py-8 border-t border-border bg-card/50 text-center text-sm text-muted-foreground mt-auto">
        <div className="container mx-auto px-4">
          <p>Built with data from the French National Taxonomic Database (TAXREF v18).</p>
          <p className="mt-1 opacity-75">Images provided by INPN API.</p>
        </div>
      </footer>
    </div>
  );
}
