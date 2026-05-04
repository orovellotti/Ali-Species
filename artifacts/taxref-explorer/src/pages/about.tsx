import { Layout } from "@/components/Layout";
import { ExternalLink, Copy, Check, Sparkles } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import patrinatLogo from "@/assets/images/logo-patrinat-official.png";
import nsLogo from "@/assets/images/logo-natural-solutions-official.png";

export default function About() {
  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";
  const [copied, setCopied] = useState(false);
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || "fr";
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Layout>
      <Helmet>
        <html lang={lang} />
        <title>{t("about.title")}</title>
        <meta name="description" content={t("about.metaDescription")} />
        <meta property="og:title" content={t("about.title")} />
        <meta property="og:description" content={t("about.metaDescription")} />
      </Helmet>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-8">
          {t("about.heading")}
        </h1>

        <div className="space-y-10">
          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.aliName")}</h2>
            <p className="text-sm text-muted-foreground/70 italic mb-2">{t("about.aliTagline")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("about.aliP1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("about.aliP2")}</p>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.taxrefHeading")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("about.taxrefP1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("about.taxrefP2")}</p>
            <a 
              href="https://inpn.mnhn.fr/accueil/recherche-de-donnees/taxref" 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
            >
              {t("about.taxrefLink")}
              <ExternalLink className="w-4 h-4" />
            </a>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.patrinatHeading")}</h2>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <a href="https://www.patrinat.fr/" target="_blank" rel="noreferrer" className="shrink-0 hover:opacity-80 transition-opacity">
                <img src={patrinatLogo} alt="PatriNat" className="w-40 object-contain" />
              </a>
              <div className="space-y-4">
                <p className="text-muted-foreground leading-relaxed">
                  <Trans i18nKey="about.patrinatBody" components={{ s: <strong className="text-foreground" /> }} />
                </p>
                <a 
                  href="https://www.patrinat.fr/" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                >
                  {t("about.patrinatLink")}
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.natsolHeading")}</h2>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <a href="https://www.natural-solutions.eu/" target="_blank" rel="noreferrer" className="shrink-0 hover:opacity-80 transition-opacity">
                <img src={nsLogo} alt="Natural Solutions" className="w-36 object-contain" />
              </a>
              <div className="space-y-4">
                <p className="text-muted-foreground leading-relaxed">
                  <Trans i18nKey="about.natsolBody" components={{ s: <strong className="text-foreground" /> }} />
                </p>
                <a 
                  href="https://www.natural-solutions.eu/" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                >
                  {t("about.natsolLink")}
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </section>

          <section className="space-y-4" id="traits">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.traitsHeading")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              <Trans i18nKey="about.traitsIntro" components={{ s: <strong className="text-foreground" /> }} />
            </p>
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("about.traitsSourcesLabel")}</div>
              <ul className="space-y-2.5 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span><Trans i18nKey="about.traitsSources.wikidata" components={{ s: <strong className="text-foreground" /> }} /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span><Trans i18nKey="about.traitsSources.pantheria" components={{ s: <strong className="text-foreground" /> }} /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span><Trans i18nKey="about.traitsSources.avonet" components={{ s: <strong className="text-foreground" /> }} /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span><Trans i18nKey="about.traitsSources.amphibio" components={{ s: <strong className="text-foreground" /> }} /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span><Trans i18nKey="about.traitsSources.squambase" components={{ s: <strong className="text-foreground" /> }} /></span>
                </li>
              </ul>
            </div>
            <a
              href={`${import.meta.env.BASE_URL}sources`}
              className="inline-flex items-center gap-2 text-primary hover:underline font-medium pt-1"
            >
              {t("about.traitsCta")}
              <ExternalLink className="w-4 h-4" />
            </a>
          </section>

          <section className="p-8 rounded-2xl bg-foreground/[0.03] border border-border space-y-4" id="mcp">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.mcpHeading")}</h2>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary rounded-full">{t("about.mcpNew")}</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              <Trans i18nKey="about.mcpBody" components={{ s: <strong className="text-foreground" /> }} />
            </p>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("about.mcpUrlLabel")}</div>
              <div className="flex items-stretch gap-0 rounded-lg border border-border bg-background overflow-hidden">
                <code className="flex-1 px-4 py-3 text-sm font-mono text-foreground truncate">{mcpUrl}</code>
                <button
                  onClick={handleCopy}
                  className="px-4 flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  data-testid="button-copy-mcp"
                >
                  {copied ? <><Check className="w-4 h-4" /> {t("about.mcpCopied")}</> : <><Copy className="w-4 h-4" /> {t("about.mcpCopy")}</>}
                </button>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("about.mcpToolsLabel")}</div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><code className="text-primary font-mono text-xs mt-0.5">search_taxons</code> — {t("about.mcpTools.search")}</li>
                <li className="flex items-start gap-2"><code className="text-primary font-mono text-xs mt-0.5">get_taxon</code> — {t("about.mcpTools.get")}</li>
                <li className="flex items-start gap-2"><code className="text-primary font-mono text-xs mt-0.5">get_classification</code> — {t("about.mcpTools.classification")}</li>
                <li className="flex items-start gap-2"><code className="text-primary font-mono text-xs mt-0.5">get_statuts</code> — {t("about.mcpTools.statuts")}</li>
                <li className="flex items-start gap-2"><code className="text-primary font-mono text-xs mt-0.5">status_breakdown</code> — {t("about.mcpTools.breakdown")}</li>
                <li className="flex items-start gap-2"><code className="text-primary font-mono text-xs mt-0.5">get_interactions</code> — {t("about.mcpTools.interactions")}</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground/80 pt-1">{t("about.mcpTransport")}</p>
          </section>

          <section className="p-8 rounded-2xl bg-primary/5 border border-primary/20 space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.supportHeading")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("about.supportP1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("about.supportP2")}</p>
            <a
              href="https://www.natural-solutions.eu/contact"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors mt-2"
            >
              {t("about.supportCta")}
              <ExternalLink className="w-4 h-4" />
            </a>
          </section>

          <section className="space-y-4 pt-6 border-t border-border">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.sourcesHeading")}</h2>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>
                  <strong className="text-foreground">{t("about.sourcesTaxonomy")}</strong>{t("about.sourcesTaxonomyBody")}
                  <a href="https://inpn.mnhn.fr/" target="_blank" rel="noreferrer" className="text-primary hover:underline">INPN</a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>
                  <strong className="text-foreground">{t("about.sourcesImages")}</strong>{t("about.sourcesImagesBody")}
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </Layout>
  );
}
