import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toPng } from "html-to-image";
import { X, Download, Link2, FileText, Linkedin, Twitter, Loader2, Check } from "lucide-react";
import {
  ShareDiscoveryCard,
  type ShareCardData,
  type ShareCardFormat,
} from "@/components/ShareDiscoveryCard";

interface Props {
  open: boolean;
  onClose: () => void;
  data: ShareCardData;
  shareUrl: string;
}

const PREVIEW_MAX_WIDTH = 720;

export function ShareDiscoveryModal({ open, onClose, data, shareUrl }: Props) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ShareCardFormat>("landscape");
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  if (!open) return null;

  const dims = format === "landscape" ? { w: 1200, h: 630 } : { w: 1080, h: 1920 };
  const previewScale = Math.min(PREVIEW_MAX_WIDTH / dims.w, 1);

  async function handleDownload() {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        width: dims.w,
        height: dims.h,
        skipFonts: false,
      });
      const link = document.createElement("a");
      const safeName = data.scientificName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      link.download = `ali-species-${safeName || data.cdNom}-${format}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("share card export failed", err);
    } finally {
      setDownloading(false);
    }
  }

  async function copy(text: string, kind: "link" | "text") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch (err) {
      console.error("clipboard failed", err);
    }
  }

  // Build a rich title (vernacular + scientific) and a fact line from the
  // already-computed card data, so the share text mentions the actual species
  // and one interesting piece of info instead of being generic.
  const title = data.vernacular
    ? `« ${data.vernacular} » (${data.scientificName})`
    : data.scientificName;
  const factLine =
    data.fact && data.fact.trim().length > 0
      ? data.fact
      : data.badge?.label
        ? data.badge.label
        : [data.classe, data.famille].filter(Boolean).join(" · ") || "";
  const twitterText = t("share.twitterText", { url: shareUrl, title, fact: factLine });
  const linkedinText = t("share.linkedinText", { url: shareUrl, title, fact: factLine });

  function openTwitter() {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}`;
    window.open(url, "_blank", "noopener,width=600,height=520");
  }
  function openLinkedIn() {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,width=600,height=520");
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div
        className="relative bg-background w-full sm:max-w-4xl sm:rounded-2xl shadow-2xl my-0 sm:my-8 overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 sm:px-6 py-4 border-b border-border">
          <div>
            <h2 id="share-modal-title" className="text-lg font-semibold text-foreground">
              {t("share.modalTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t("share.modalSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground rounded-md p-1.5 hover:bg-muted -mr-1.5"
            data-testid="button-share-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 sm:px-6 pt-5 pb-6 space-y-5">
            {/* Format toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground mr-1">
                {t("share.formatLabel")} :
              </span>
              {(["landscape", "story"] as ShareCardFormat[]).map((f) => {
                const active = format === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={
                      "text-xs px-3 py-1.5 rounded-full border transition-colors " +
                      (active
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40")
                    }
                    data-testid={`button-share-format-${f}`}
                    aria-pressed={active}
                  >
                    {f === "landscape" ? t("share.formatLandscape") : t("share.formatStory")}
                  </button>
                );
              })}
            </div>

            {/* Preview area */}
            <div className="rounded-xl border border-border bg-muted/40 p-4 flex items-center justify-center overflow-hidden">
              <div
                style={{
                  width: dims.w * previewScale,
                  height: dims.h * previewScale,
                }}
                className="relative"
              >
                <div
                  style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    width: dims.w,
                    height: dims.h,
                  }}
                >
                  <ShareDiscoveryCard ref={cardRef} data={data} format={format} />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
                data-testid="button-share-download"
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("share.downloading")}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    {t("share.download")}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => copy(shareUrl, "link")}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors"
                data-testid="button-share-copy-link"
              >
                {copied === "link" ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
                {copied === "link" ? t("share.linkCopied") : t("share.copyLink")}
              </button>
              <button
                type="button"
                onClick={() => copy(linkedinText, "text")}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors"
                data-testid="button-share-copy-text"
              >
                {copied === "text" ? <Check className="w-4 h-4 text-emerald-600" /> : <FileText className="w-4 h-4" />}
                {copied === "text" ? t("share.textCopied") : t("share.copyText")}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openLinkedIn}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors"
                  data-testid="button-share-linkedin"
                >
                  <Linkedin className="w-4 h-4 text-[#0A66C2]" />
                  {t("share.shareLinkedin")}
                </button>
                <button
                  type="button"
                  onClick={openTwitter}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors"
                  data-testid="button-share-twitter"
                >
                  <Twitter className="w-4 h-4 text-[#1D9BF0]" />
                  {t("share.shareTwitter")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
