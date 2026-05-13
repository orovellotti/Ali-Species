import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, ChevronRight, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDebounce } from "@/hooks/use-debounce";
import { useShareTaxon } from "@/hooks/use-share-taxon";
import { getSearchTaxonsQueryKey, useSearchTaxons } from "@workspace/api-client-react";
import { formatRank, taxonUrl } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { ShareDiscoveryModal } from "@/components/ShareDiscoveryModal";

export function SearchAutocomplete() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const { t } = useTranslation();
  const { shareData, shareUrl, sharingCdNom, openShareFor, closeShare } = useShareTaxon();

  const { data: results, isLoading } = useSearchTaxons(
    { q: debouncedQuery, limit: 8 },
    { query: { enabled: debouncedQuery.length > 1, queryKey: getSearchTaxonsQueryKey({ q: debouncedQuery, limit: 8 }) } }
  );

  const handleSelect = (cdNom: number, lbNom?: string) => {
    setQuery("");
    setIsFocused(false);
    setLocation(taxonUrl(cdNom, lbNom));
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto z-40">
      <div className={`relative flex items-center w-full transition-all duration-300 ${isFocused ? 'shadow-lg ring-2 ring-primary/20' : 'shadow-sm'} bg-background rounded-full border border-border overflow-hidden`}>
        <div className="pl-5 text-muted-foreground">
          <Search className="w-5 h-5" />
        </div>
        <Input
          type="text"
          placeholder={t("search.placeholder")}
          className="flex-1 border-0 bg-transparent h-14 px-4 text-base focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none placeholder:text-muted-foreground/70"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          data-testid="input-search"
        />
        {isLoading && debouncedQuery.length > 1 && (
          <div className="pr-5 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
      </div>

      {isFocused && debouncedQuery.length > 1 && results && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {results.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm" data-testid="text-no-results">
              {t("search.noResults", { query: debouncedQuery })}
            </div>
          ) : (
            <ul className="py-2" data-testid="list-search-results">
              {results.map((taxon) => (
                <li key={taxon.cdNom} className="relative group">
                  <button
                    className="w-full px-5 py-3 pr-14 text-left hover:bg-muted flex items-center justify-between transition-colors"
                    onClick={() => handleSelect(taxon.cdNom, taxon.lbNom)}
                    data-testid={`button-taxon-${taxon.cdNom}`}
                  >
                    <div>
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {taxon.lbNom}
                        {taxon.nomVern && (
                          <span className="text-sm font-normal text-muted-foreground truncate max-w-[200px] sm:max-w-[300px]">
                            - {taxon.nomVern}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-medium text-[10px] uppercase tracking-wider">
                          {formatRank(taxon.rang)}
                        </span>
                        <span className="font-mono text-[10px]">CD_NOM: {taxon.cdNom}</span>
                        <span className="font-mono text-[10px]">CD_REF: {taxon.cdRef}</span>
                        {taxon.famille && <span>{taxon.famille}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // onMouseDown beats the parent input's onBlur (200ms timeout)
                      // so the dropdown stays open while the modal opens.
                      e.preventDefault();
                      e.stopPropagation();
                      void openShareFor({
                        cdNom: taxon.cdNom,
                        lbNom: taxon.lbNom ?? "",
                        nomVern: taxon.nomVern ?? null,
                        rang: taxon.rang ?? "",
                        famille: taxon.famille ?? null,
                      });
                    }}
                    disabled={sharingCdNom === taxon.cdNom}
                    className="absolute top-1/2 -translate-y-1/2 right-3 w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-wait"
                    aria-label={t("share.button")}
                    title={t("share.button")}
                    data-testid={`button-share-${taxon.cdNom}`}
                  >
                    {sharingCdNom === taxon.cdNom ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Share2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {shareData && (
        <ShareDiscoveryModal
          open={true}
          onClose={closeShare}
          data={shareData}
          shareUrl={shareUrl}
        />
      )}
    </div>
  );
}
