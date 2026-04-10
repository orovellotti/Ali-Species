import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, ChevronRight } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { getSearchTaxonsQueryKey, useSearchTaxons } from "@workspace/api-client-react";
import { formatRank } from "@/lib/constants";
import { Input } from "@/components/ui/input";

export function SearchAutocomplete() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  const { data: results, isLoading } = useSearchTaxons(
    { q: debouncedQuery, limit: 8 },
    { query: { enabled: debouncedQuery.length > 1, queryKey: getSearchTaxonsQueryKey({ q: debouncedQuery, limit: 8 }) } }
  );

  const handleSelect = (cdNom: number) => {
    setQuery("");
    setIsFocused(false);
    setLocation(`/taxon/${cdNom}`);
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto z-40">
      <div className={`relative flex items-center w-full transition-all duration-300 ${isFocused ? 'shadow-lg ring-2 ring-primary/20' : 'shadow-sm'} bg-background rounded-full border border-border overflow-hidden`}>
        <div className="pl-5 text-muted-foreground">
          <Search className="w-5 h-5" />
        </div>
        <Input
          type="text"
          placeholder="Rechercher par nom scientifique ou nom commun..."
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
              Aucun taxon trouve pour "{debouncedQuery}".
            </div>
          ) : (
            <ul className="py-2" data-testid="list-search-results">
              {results.map((taxon) => (
                <li key={taxon.cdNom}>
                  <button
                    className="w-full px-5 py-3 text-left hover:bg-muted flex items-center justify-between group transition-colors"
                    onClick={() => handleSelect(taxon.cdNom)}
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
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-medium text-[10px] uppercase tracking-wider">
                          {formatRank(taxon.rang)}
                        </span>
                        {taxon.famille && <span>{taxon.famille}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
