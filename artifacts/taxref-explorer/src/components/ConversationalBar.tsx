import { useState, useRef, useEffect, type FormEvent } from "react";
import { Sparkles, Send, Loader2, RotateCcw } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { taxonUrl } from "@/lib/constants";
import { localeNumber } from "@/i18n";

type ResultItem = {
  cdNom: number;
  lbNom: string;
  nomVern: string | null;
  rang: string;
  classe: string | null;
  ordre: string | null;
  famille: string | null;
};

type Turn = {
  question: string;
  reply: string;
  results: ResultItem[];
  totalCount: number;
};

export function ConversationalBar() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || "fr";
  const suggestionGroups = (t("conversational.suggestions", { returnObjects: true }) as unknown as Record<string, string[]>) ?? {};
  const levelLabels = (t("conversational.suggestionLevels", { returnObjects: true }) as unknown as Record<string, string>) ?? {};
  const levelOrder: Array<"simple" | "complex" | "advanced"> = ["simple", "complex", "advanced"];
  const levelDots: Record<"simple" | "complex" | "advanced", string> = {
    simple: "bg-emerald-500",
    complex: "bg-amber-500",
    advanced: "bg-rose-500",
  };

  function pickSuggestion(s: string) {
    setInput(s);
    const el = inputRef.current;
    if (el) {
      el.focus();
      const len = s.length;
      requestAnimationFrame(() => el.setSelectionRange(len, len));
    }
  }

  useEffect(() => {
    if (turns.length > 0 && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [turns.length]);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    const history = turns.flatMap((t) => [
      { role: "user", content: t.question },
      { role: "assistant", content: t.reply },
    ]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, lang }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTurns((prev) => [
        ...prev,
        {
          question,
          reply: data.reply ?? "",
          results: Array.isArray(data.results) ? data.results : [],
          totalCount: data.totalCount ?? 0,
        },
      ]);
      setInput("");
    } catch (e: any) {
      setError(e.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={onSubmit} className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-5 pointer-events-none">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder={t("conversational.placeholder")}
          className="w-full bg-background border border-border rounded-full pl-14 pr-14 py-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm transition-all"
          data-testid="input-conversational"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="absolute inset-y-0 right-0 flex items-center justify-center pr-2"
          data-testid="button-ask"
          aria-label={t("conversational.submitAria")}
        >
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary transition-all">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </span>
        </button>
      </form>

      {turns.length === 0 && !loading && (
        <div className="mt-6 px-2">
          <p className="text-xs text-muted-foreground font-medium text-center mb-4">
            {t("conversational.suggestionLevelsLabel")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {levelOrder.map((lvl) => {
              const items = suggestionGroups[lvl] ?? [];
              if (items.length === 0) return null;
              return (
                <div
                  key={lvl}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/40 p-3"
                  data-testid={`group-suggestion-${lvl}`}
                >
                  <div className="flex items-center gap-2 px-1">
                    <span className={"w-2 h-2 rounded-full " + levelDots[lvl]} aria-hidden="true" />
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground/80">
                      {levelLabels[lvl] ?? lvl}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {items.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => pickSuggestion(s)}
                          className="w-full text-left text-xs leading-snug px-2.5 py-2 rounded-md border border-transparent text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors"
                          data-testid="button-suggestion"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-left">
          {t("conversational.errorPrefix")}{error}
        </div>
      )}

      {turns.length > 0 && (
        <div ref={scrollRef} className="mt-8 space-y-8 text-left">
          {turns.map((tn, idx) => (
            <ConversationTurn key={idx} turn={tn} lang={lang} />
          ))}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => { setTurns([]); setError(null); }}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              data-testid="button-reset"
            >
              <RotateCcw className="w-3 h-3" /> {t("conversational.newConversation")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationTurn({ turn, lang }: { turn: Turn; lang: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex justify-end mb-3">
        <div className="bg-primary/10 text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">
          {turn.question}
        </div>
      </div>
      <div className="bg-background border border-border rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{turn.reply.replace(/\*\*/g, "")}</p>
            {turn.results.length > 0 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {turn.results.map((r) => (
                  <Link
                    key={r.cdNom}
                    href={taxonUrl(r.cdNom, r.lbNom)}
                    className="group block px-3 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    data-testid="link-result"
                  >
                    <div className="text-sm font-medium text-foreground italic group-hover:text-primary truncate">
                      {r.lbNom}
                    </div>
                    {r.nomVern && (
                      <div className="text-xs text-muted-foreground truncate">{r.nomVern}</div>
                    )}
                    {(r.classe || r.famille) && (
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                        {[r.classe, r.famille].filter(Boolean).join(" › ")}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
            {turn.totalCount > turn.results.length && turn.results.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground italic">
                {t("conversational.pagingPre")}{turn.results.length}{t("conversational.pagingMid")}{localeNumber(turn.totalCount, lang)}{t("conversational.pagingPost")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
