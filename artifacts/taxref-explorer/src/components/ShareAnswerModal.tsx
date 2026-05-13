import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Copy, Link2, Check, Linkedin, Twitter } from "lucide-react";

export type ShareableAnswer = {
  question: string;
  reply: string;
  results: Array<{ cdNom: number; lbNom: string; nomVern: string | null }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  data: ShareableAnswer;
};

/**
 * Lightweight modal to share a chat answer (question + reply + cited species).
 * Builds a re-runnable link of the form `${origin}${BASE_URL}?q={question}`,
 * which the home page detects on mount and re-submits.
 */
export function ShareAnswerModal({ open, onClose, data }: Props) {
  const { t } = useTranslation();
  const [linkCopied, setLinkCopied] = useState(false);
  const [textCopied, setTextCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Truncate the reply to keep social-friendly text payload reasonable
  const trimmedReply = data.reply.replace(/\*\*/g, "").trim();
  const shortReply = trimmedReply.length > 600 ? trimmedReply.slice(0, 597) + "…" : trimmedReply;

  const baseUrl = (import.meta.env.BASE_URL || "/").toString();
  const shareUrl = `${window.location.origin}${baseUrl}?q=${encodeURIComponent(data.question)}`;

  const linkedinText = t("shareAnswer.linkedinText", { url: shareUrl, question: data.question, reply: shortReply });
  const twitterText = t("shareAnswer.twitterText", { url: shareUrl, question: data.question });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  async function copy(text: string, kind: "link" | "text") {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === "link") {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } else {
        setTextCopied(true);
        setTimeout(() => setTextCopied(false), 2000);
      }
    } catch {
      /* clipboard refused — silently ignore, user can select manually */
    }
  }

  function shareLinkedin() {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,width=600,height=600");
  }
  function shareTwitter() {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}`;
    window.open(url, "_blank", "noopener,width=600,height=600");
  }

  const previewResults = data.results.slice(0, 5);
  const remaining = Math.max(0, data.results.length - previewResults.length);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-answer-title"
    >
      <div
        ref={dialogRef}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border">
          <div>
            <h2 id="share-answer-title" className="text-lg font-serif font-semibold text-foreground">
              {t("shareAnswer.modalTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t("shareAnswer.modalSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
              {t("shareAnswer.questionLabel")}
            </div>
            <div className="text-sm text-foreground italic bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
              {data.question}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
              {t("shareAnswer.answerLabel")}
            </div>
            <div className="text-sm text-foreground bg-muted/40 border border-border rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {shortReply}
            </div>
          </div>

          {previewResults.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                {t("shareAnswer.resultsLabel")}
              </div>
              <ul className="text-xs space-y-0.5">
                {previewResults.map((r) => (
                  <li key={r.cdNom} className="text-muted-foreground">
                    <span className="italic text-foreground">{r.lbNom}</span>
                    {r.nomVern && <span> — {r.nomVern}</span>}
                  </li>
                ))}
                {remaining > 0 && (
                  <li className="text-muted-foreground/70 italic">
                    {t("shareAnswer.moreResults", { count: remaining })}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 pt-4 pb-5 border-t border-border bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => copy(shareUrl, "link")}
              className="inline-flex items-center justify-center gap-2 h-10 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted transition-colors"
              data-testid="button-copy-link"
            >
              {linkCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
              {linkCopied ? t("shareAnswer.linkCopied") : t("shareAnswer.copyLink")}
            </button>
            <button
              type="button"
              onClick={() => copy(linkedinText, "text")}
              className="inline-flex items-center justify-center gap-2 h-10 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted transition-colors"
              data-testid="button-copy-text"
            >
              {textCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {textCopied ? t("shareAnswer.textCopied") : t("shareAnswer.copyText")}
            </button>
            <button
              type="button"
              onClick={shareLinkedin}
              className="inline-flex items-center justify-center gap-2 h-10 px-3 rounded-md text-sm font-medium text-white bg-[#0A66C2] hover:bg-[#0A66C2]/90 transition-colors"
              data-testid="button-share-linkedin"
            >
              <Linkedin className="w-4 h-4" />
              {t("shareAnswer.shareLinkedin")}
            </button>
            <button
              type="button"
              onClick={shareTwitter}
              className="inline-flex items-center justify-center gap-2 h-10 px-3 rounded-md text-sm font-medium text-white bg-black hover:bg-black/85 transition-colors"
              data-testid="button-share-twitter"
            >
              <Twitter className="w-4 h-4" />
              {t("shareAnswer.shareTwitter")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
