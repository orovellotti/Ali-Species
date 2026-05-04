import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage?.startsWith("en") ? "en" : "fr";

  const setLang = (lang: "fr" | "en") => {
    if (lang !== current) {
      void i18n.changeLanguage(lang);
    }
  };

  return (
    <div
      className="inline-flex items-center gap-1 text-xs font-medium"
      role="group"
      aria-label={t("common.language")}
      data-testid="lang-switcher"
    >
      {!compact && <Globe className="w-3.5 h-3.5 text-muted-foreground/70 mr-0.5" aria-hidden="true" />}
      <button
        type="button"
        onClick={() => setLang("fr")}
        aria-pressed={current === "fr"}
        className={`px-2 py-1 rounded-full transition-colors ${
          current === "fr"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
        data-testid="lang-fr"
      >
        FR
      </button>
      <span className="text-muted-foreground/40" aria-hidden="true">/</span>
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={current === "en"}
        className={`px-2 py-1 rounded-full transition-colors ${
          current === "en"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
        data-testid="lang-en"
      >
        EN
      </button>
    </div>
  );
}
