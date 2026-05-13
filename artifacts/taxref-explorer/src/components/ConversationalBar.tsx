import { useState, useRef, useEffect, useMemo, type FormEvent, type ReactNode } from "react";
import { Sparkles, Send, Loader2, RotateCcw, Share2 } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { taxonUrl } from "@/lib/constants";
import { localeNumber } from "@/i18n";
import { ShareAnswerModal, type ShareableAnswer } from "@/components/ShareAnswerModal";

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
  const [answerToShare, setAnswerToShare] = useState<ShareableAnswer | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || "fr";

  // Auto-submit when arriving with `?q=...` (deep-link from a shared answer)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const seed = params.get("q");
    if (seed && seed.trim()) {
      // Strip the param from the URL so a manual reset doesn't re-trigger
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState({}, "", url.toString());
      void ask(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <ConversationTurn
              key={idx}
              turn={tn}
              lang={lang}
              onShareAnswer={() =>
                setAnswerToShare({
                  question: tn.question,
                  reply: tn.reply,
                  results: tn.results.map((r) => ({ cdNom: r.cdNom, lbNom: r.lbNom, nomVern: r.nomVern })),
                })
              }
            />
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

      {answerToShare && (
        <ShareAnswerModal
          open={true}
          onClose={() => setAnswerToShare(null)}
          data={answerToShare}
        />
      )}
    </div>
  );
}

function ConversationTurn({
  turn,
  lang,
  onShareAnswer,
}: {
  turn: Turn;
  lang: string;
  onShareAnswer: () => void;
}) {
  const { t } = useTranslation();
  const linkedCdNoms = useMemo(() => new Set<number>(), [turn.reply, turn.results]);
  const unlinkedResults = useMemo(() => {
    // linkedCdNoms is populated as a side-effect of linkifyReply during the
    // first render. We need a stable derivation, so we precompute which
    // results actually appear in the text using the same matcher logic.
    const found = new Set<number>();
    const text = turn.reply;
    for (const r of turn.results) {
      const names = uniqueNames(r);
      if (names.some((n) => buildNameRegex(n).test(text))) {
        found.add(r.cdNom);
      }
    }
    // Mirror into linkedCdNoms so the inline renderer can skip them
    found.forEach((id) => linkedCdNoms.add(id));
    return turn.results.filter((r) => !found.has(r.cdNom));
  }, [turn.reply, turn.results, linkedCdNoms]);
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
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap flex-1">
                {linkifyReply(turn.reply, turn.results, linkedCdNoms)}
              </p>
              <button
                type="button"
                onClick={onShareAnswer}
                className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:border-primary/40 active:scale-95 transition-all shadow-sm"
                aria-label={t("shareAnswer.button")}
                title={t("shareAnswer.button")}
                data-testid="button-share-answer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("shareAnswer.button")}</span>
              </button>
            </div>
            {unlinkedResults.length > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">{t("conversational.alsoSee")} </span>
                {unlinkedResults.map((r, i) => (
                  <span key={r.cdNom}>
                    {i > 0 && <span>, </span>}
                    <Link
                      href={taxonUrl(r.cdNom, r.lbNom)}
                      className="italic text-primary hover:underline"
                      data-testid="link-result"
                    >
                      {r.lbNom}
                    </Link>
                  </span>
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

// ---------- Reply linkification ----------------------------------------

function uniqueNames(r: ResultItem): string[] {
  // Scientific name + first vernacular (split on commas — TAXREF often
  // packs several synonyms into nomVern).
  const out: string[] = [];
  const sci = r.lbNom?.trim();
  if (sci) out.push(sci);
  if (r.nomVern) {
    for (const part of r.nomVern.split(/[,;]/)) {
      const v = part.trim();
      if (v && v.length >= 4) out.push(v);
    }
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildNameRegex(name: string): RegExp {
  // Word-boundary on each side, case-insensitive, unicode-aware.
  // We avoid \b because it doesn't play nice with accents — use lookarounds
  // on non-letter chars instead.
  return new RegExp(`(?<![\\p{L}])${escapeRegex(name)}(?![\\p{L}])`, "iu");
}

function linkifyReply(reply: string, results: ResultItem[], _linked: Set<number>): ReactNode[] {
  const stripped = reply.replace(/\*\*/g, "");
  if (results.length === 0) return [stripped];

  // Build all (name → cdNom + lbNom) pairs, sorted by length desc so that
  // longer names match before their shorter prefixes (e.g. "Mésange bleue"
  // before "Mésange").
  type Match = { start: number; end: number; cdNom: number; lbNom: string; matched: string };
  const candidates: Array<{ name: string; cdNom: number; lbNom: string }> = [];
  for (const r of results) {
    for (const n of uniqueNames(r)) {
      candidates.push({ name: n, cdNom: r.cdNom, lbNom: r.lbNom });
    }
  }
  candidates.sort((a, b) => b.name.length - a.name.length);

  // Find non-overlapping matches, longest-first.
  const matches: Match[] = [];
  const occupied: Array<[number, number]> = [];
  for (const c of candidates) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegex(c.name)}(?![\\p{L}])`, "giu");
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const overlaps = occupied.some(([a, b]) => start < b && end > a);
      if (overlaps) continue;
      matches.push({ start, end, cdNom: c.cdNom, lbNom: c.lbNom, matched: m[0] });
      occupied.push([start, end]);
    }
  }
  matches.sort((a, b) => a.start - b.start);

  if (matches.length === 0) return [stripped];

  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.start > cursor) nodes.push(stripped.slice(cursor, m.start));
    nodes.push(
      <Link
        key={`m-${i}-${m.start}`}
        href={taxonUrl(m.cdNom, m.lbNom)}
        className="text-primary italic hover:underline font-medium"
        data-testid="link-inline-taxon"
      >
        {m.matched}
      </Link>,
    );
    cursor = m.end;
  }
  if (cursor < stripped.length) nodes.push(stripped.slice(cursor));
  return nodes;
}
