import { useState, useRef, useEffect, type FormEvent } from "react";
import { Sparkles, Send, Loader2, RotateCcw } from "lucide-react";
import { Link } from "wouter";
import { taxonUrl } from "@/lib/constants";

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

const SUGGESTIONS = [
  "Quels mammifères sont protégés en France ?",
  "Combien d'espèces d'oiseaux y a-t-il en France ?",
  "Liste les amphibiens en danger critique",
  "Montre-moi les espèces invasives interdites d'introduction",
  "Quelles sont les ZNIEFF déterminantes en Bretagne ?",
  "Donne-moi des exemples d'orchidées",
];

export function ConversationalBar() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ question, history }),
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
      setError(e.message ?? "Erreur");
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
          placeholder="Posez une question : « combien d'oiseaux protégés en France ? »"
          className="w-full bg-background border border-border rounded-full pl-14 pr-14 py-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm transition-all"
          data-testid="input-conversational"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="absolute inset-y-0 right-0 flex items-center justify-center pr-2"
          data-testid="button-ask"
          aria-label="Envoyer"
        >
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary transition-all">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </span>
        </button>
      </form>

      {turns.length === 0 && !loading && (
        <div className="mt-4 flex flex-wrap justify-center gap-2 px-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSuggestion(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
              data-testid="button-suggestion"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-left">
          Une erreur est survenue : {error}
        </div>
      )}

      {turns.length > 0 && (
        <div ref={scrollRef} className="mt-8 space-y-8 text-left">
          {turns.map((t, idx) => (
            <ConversationTurn key={idx} turn={t} />
          ))}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => { setTurns([]); setError(null); }}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              data-testid="button-reset"
            >
              <RotateCcw className="w-3 h-3" /> Nouvelle conversation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationTurn({ turn }: { turn: Turn }) {
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
                Affichage de {turn.results.length} sur {turn.totalCount.toLocaleString("fr-FR")} résultats
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
