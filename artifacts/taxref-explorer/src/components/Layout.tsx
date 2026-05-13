import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import aliLogo from "@/assets/images/ali-logo.png";
import nsLogo from "@/assets/images/logo-natural-solutions-official.png";
import patrinatLogo from "@/assets/images/logo-patrinat-official.png";
import globiLogo from "@/assets/images/globi-logo.png";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const navLinks = (
    <>
      <Link href="/" className="hover:text-foreground transition-colors">{t("nav.home")}</Link>
      <Link href="/taxonomie" className="hover:text-foreground transition-colors" data-testid="link-taxonomie">{t("nav.statuses")}</Link>
      <Link href="/sources" className="hover:text-foreground transition-colors" data-testid="link-sources">{t("nav.sources")}</Link>
      <Link href="/export" className="hover:text-foreground transition-colors" data-testid="link-export">{t("nav.export")}</Link>
      <Link href="/ai-agents" className="hover:text-foreground transition-colors" data-testid="link-ai-agents">{t("nav.aiAgents")}</Link>
      <Link href="/a-propos" className="hover:text-foreground transition-colors">{t("nav.about")}</Link>
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 group transition-opacity hover:opacity-80 min-w-0">
            <img src={aliLogo} alt="ALI Species" className="w-8 h-8 flex-shrink-0" />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-serif font-semibold text-base sm:text-lg tracking-tight flex items-center gap-2">
                <span className="truncate">ALI Species</span>
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[9px] font-bold uppercase tracking-wider ring-1 ring-primary/20 flex-shrink-0"
                  data-testid="badge-beta"
                >
                  {t("nav.beta")}
                </span>
              </span>
              <span className="hidden sm:inline text-[10px] text-muted-foreground tracking-widest uppercase truncate">{t("nav.tagline")}</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            {navLinks}
            <Link
              href="/ai-agents"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
              data-testid="link-mcp-header"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider">MCP</span>
              <span className="text-xs">API</span>
            </Link>
            <LanguageSwitcher />
          </nav>

          {/* Mobile controls */}
          <div className="flex lg:hidden items-center gap-1">
            <LanguageSwitcher />
            <button
              type="button"
              aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              data-testid="button-mobile-menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        {mobileOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 top-16 bg-background/60 backdrop-blur-sm z-40"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <nav
              id="mobile-nav"
              className="lg:hidden absolute top-full left-0 right-0 z-50 border-b border-border/40 bg-background shadow-lg"
            >
              <div className="container mx-auto px-4 py-4 flex flex-col gap-1 text-base font-medium text-muted-foreground">
                <Link href="/" className="px-3 py-3 rounded-md hover:bg-muted hover:text-foreground transition-colors">{t("nav.home")}</Link>
                <Link href="/taxonomie" className="px-3 py-3 rounded-md hover:bg-muted hover:text-foreground transition-colors" data-testid="link-taxonomie-mobile">{t("nav.statuses")}</Link>
                <Link href="/sources" className="px-3 py-3 rounded-md hover:bg-muted hover:text-foreground transition-colors" data-testid="link-sources-mobile">{t("nav.sources")}</Link>
                <Link href="/export" className="px-3 py-3 rounded-md hover:bg-muted hover:text-foreground transition-colors" data-testid="link-export-mobile">{t("nav.export")}</Link>
                <Link href="/ai-agents" className="px-3 py-3 rounded-md hover:bg-muted hover:text-foreground transition-colors" data-testid="link-ai-agents-mobile">{t("nav.aiAgents")}</Link>
                <Link href="/a-propos" className="px-3 py-3 rounded-md hover:bg-muted hover:text-foreground transition-colors">{t("nav.about")}</Link>
                <Link
                  href="/ai-agents"
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition-colors self-start"
                  data-testid="link-mcp-header-mobile"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider">MCP</span>
                  <span className="text-xs">API</span>
                </Link>
              </div>
            </nav>
          </>
        )}
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
            <a href="https://www.globalbioticinteractions.org/" target="_blank" rel="noreferrer" className="block hover:opacity-80 transition-opacity" data-testid="link-globi-footer">
              <img
                src={globiLogo}
                alt="Global Biotic Interactions (GloBI)"
                className="h-12 object-contain"
              />
            </a>
          </div>

          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("footer.dataFromIntro")}
              <a href="https://inpn.mnhn.fr/accueil/recherche-de-donnees/taxref" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">{t("footer.taxrefName")}</a>
            </p>
            <p className="text-sm text-muted-foreground">
              {t("footer.producedByPre")}
              <a href="https://www.patrinat.fr/" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">{t("footer.patrinatName")}</a>
              {t("footer.producedByPost")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("footer.networksByPre")}
              <a href="https://www.globalbioticinteractions.org/" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">{t("footer.globiName")}</a>
              {t("footer.networksByPost")}
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 pt-4">
            <p className="text-sm text-muted-foreground text-center max-w-xl">
              {t("footer.contactPrompt")}
            </p>
            <a
              href="https://www.natural-solutions.eu/contact"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-full transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("footer.contactCta")}
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>

          <div className="flex items-center justify-center flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-border/50">
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
            {t("footer.imagesCredit")}
          </p>
          {/* Trans usage to satisfy unused-import in TS while keeping API usable in pages */}
          <span className="hidden"><Trans i18nKey="common.loading" /></span>
        </div>
      </footer>
    </div>
  );
}
