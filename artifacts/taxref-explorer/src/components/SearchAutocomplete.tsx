import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, ChevronRight, MapPin, X } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { getSearchTaxonsQueryKey, useSearchTaxons } from "@workspace/api-client-react";
import { formatRank, taxonUrl } from "@/lib/constants";
import { Input } from "@/components/ui/input";

type Territoire = { lb: string; cd_sig: string; niveau: string; taxa: number };

export function SearchAutocomplete() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [territoires, setTerritoires] = useState<Territoire[]>([]);
  const [territoire, setTerritoire] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ali:territoire") || "";
  });
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    fetch("/api/territoires").then(r => r.json()).then(setTerritoires).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (territoire) localStorage.setItem("ali:territoire", territoire);
      else localStorage.removeItem("ali:territoire");
    }
  }, [territoire]);

  const params = { q: debouncedQuery, limit: 8, ...(territoire ? { territoire } : {}) };
  const { data: results, isLoading } = useSearchTaxons(
    params,
    { query: { enabled: debouncedQuery.length > 1, queryKey: getSearchTaxonsQueryKey(params) } }
  );

  const handleSelect = (cdNom: number, lbNom?: string) => {
    setQuery("");
    setIsFocused(false);
    setLocation(taxonUrl(cdNom, lbNom));
  };

  const regions = territoires.filter(t => t.niveau === "Région");
  const departements = territoires.filter(t => t.niveau === "Département");
  const selected = territoires.find(t => t.cd_sig === territoire);

  return (
    <div className="relative w-full max-w-2xl mx-auto z-40">
      <div className={`relative flex items-center w-full transition-all duration-300 ${isFocused ? 'shadow-lg ring-2 ring-primary/20' : 'shadow-sm'} bg-background rounded-full border border-border overflow-hidden`}>
        <div className="pl-5 text-muted-foreground">
          <Search className="w-5 h-5" />
        </div>
        <Input
          type="text"
          placeholder={selected ? `Rechercher dans ${selected.lb}...` : "Rechercher par nom scientifique ou nom commun..."}
          className="flex-1 border-0 bg-transparent h-14 px-4 text-base focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none placeholder:text-muted-foreground/70"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          data-testid="input-search"
        />
        {isLoading && debouncedQuery.length > 1 && (
          <div className="pr-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        <div className="relative flex items-center pr-2 border-l border-border ml-1">
          <MapPin className="w-4 h-4 text-muted-foreground ml-3 pointer-events-none" />
          <select
            value={territoire}
            onChange={(e) => setTerritoire(e.target.value)}
            className="appearance-none bg-transparent h-14 pl-2 pr-8 text-sm text-foreground focus:outline-none cursor-pointer max-w-[160px] truncate"
            aria-label="Filtrer par territoire"
            data-testid="select-territoire"
          >
            <option value="">Tous les territoires</option>
            {regions.length > 0 && (
              <optgroup label="Régions">
                {regions.map(t => <option key={t.cd_sig} value={t.cd_sig}>{t.lb} ({t.taxa})</option>)}
              </optgroup>
            )}
            {departements.length > 0 && (
              <optgroup label="Départements">
                {departements.map(t => <option key={t.cd_sig} value={t.cd_sig}>{t.lb} ({t.taxa})</option>)}
              </optgroup>
            )}
          </select>
          {territoire && (
            <button
              type="button"
              onClick={() => setTerritoire("")}
              className="absolute right-2 p-1 text-muted-foreground hover:text-foreground"
              aria-label="Effacer le filtre territoire"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {selected && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <MapPin className="w-3 h-3" />
          Restreint aux taxons disposant d'un statut en <span className="font-semibold text-foreground">{selected.lb}</span> ({selected.niveau})
        </div>
      )}

      {isFocused && debouncedQuery.length > 1 && results && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {results.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm" data-testid="text-no-results">
              Aucun taxon trouve pour "{debouncedQuery}"{selected ? ` en ${selected.lb}` : ""}.
            </div>
          ) : (
            <ul className="py-2" data-testid="list-search-results">
              {results.map((taxon) => (
                <li key={taxon.cdNom}>
                  <button
                    className="w-full px-5 py-3 text-left hover:bg-muted flex items-center justify-between group transition-colors"
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
