import { Layout } from "@/components/Layout";
import { ExternalLink, Database, Globe, Sparkles, Network, Server, Layers } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Trans, useTranslation } from "react-i18next";
import patrinatLogo from "@/assets/images/logo-patrinat-official.png";
import nsLogo from "@/assets/images/logo-natural-solutions-official.png";

export default function About() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || "fr";

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

        <div className="space-y-12">
          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.aliName")}</h2>
            <p className="text-sm text-muted-foreground/70 italic mb-2">{t("about.aliTagline")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("about.aliP1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("about.aliP2")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.whyHeading")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("about.whyP1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("about.whyP2")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("about.whyP3")}</p>
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

          <section className="space-y-5" id="architecture">
            <h2 className="text-2xl font-serif font-semibold text-foreground">{t("about.archHeading")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("about.archIntro")}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <ArchBlock icon={<Database className="w-4 h-4" />} label={t("about.archPipelineLabel")} bodyKey="about.archPipelineBody" />
              <ArchBlock icon={<Layers className="w-4 h-4" />} label={t("about.archAppLabel")} bodyKey="about.archAppBody" />
              <ArchBlock icon={<Sparkles className="w-4 h-4" />} label={t("about.archAiLabel")} bodyKey="about.archAiBody" />
              <ArchBlock icon={<Network className="w-4 h-4" />} label={t("about.archRdfLabel")} bodyKey="about.archRdfBody" />
              <ArchBlock icon={<Server className="w-4 h-4" />} label={t("about.archMcpLabel")} bodyKey="about.archMcpBody" />
              <ArchBlock icon={<Globe className="w-4 h-4" />} label={t("about.archStackLabel")} bodyKey="about.archStackBody" />
            </div>
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
        </div>
      </div>
    </Layout>
  );
}

function ArchBlock({ icon, label, bodyKey }: { icon: React.ReactNode; label: string; bodyKey: string }) {
  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 mb-2 text-foreground">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-semibold uppercase tracking-wider">{label}</h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        <Trans
          i18nKey={bodyKey}
          components={{
            s: <strong className="text-foreground" />,
            code: <code className="font-mono text-xs bg-muted/60 px-1 py-0.5 rounded text-foreground" />,
          }}
        />
      </p>
    </div>
  );
}
