import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Leaf } from "lucide-react";

export type ShareCardFormat = "landscape" | "story";

export interface ShareCardData {
  cdNom: number;
  scientificName: string;
  author?: string | null;
  vernacular?: string | null;
  rankLabel?: string | null;
  imageUrl?: string | null;
  imageCredit?: string | null;
  classe?: string | null;
  famille?: string | null;
  fact?: string | null;
  badge?: { label: string; tone: "danger" | "warning" | "info" | "neutral" } | null;
}

const FORMAT_DIMS: Record<ShareCardFormat, { w: number; h: number }> = {
  landscape: { w: 1200, h: 630 },
  story: { w: 1080, h: 1920 },
};

const TONE_BG: Record<NonNullable<ShareCardData["badge"]>["tone"], string> = {
  danger: "bg-rose-500/90 text-white",
  warning: "bg-amber-400/90 text-amber-950",
  info: "bg-emerald-400/90 text-emerald-950",
  neutral: "bg-white/15 text-white",
};

export const ShareDiscoveryCard = forwardRef<
  HTMLDivElement,
  { data: ShareCardData; format: ShareCardFormat }
>(function ShareDiscoveryCard({ data, format }, ref) {
  const { t } = useTranslation();
  const dims = FORMAT_DIMS[format];
  const isStory = format === "story";

  return (
    <div
      ref={ref}
      style={{
        width: `${dims.w}px`,
        height: `${dims.h}px`,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
      className="relative overflow-hidden text-white"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#0b3d2e_0%,#0f5132_45%,#1a7a4f_100%)]" />
      {/* Subtle texture */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(circle at 20% 10%, rgba(255,255,255,0.18), transparent 45%), radial-gradient(circle at 80% 90%, rgba(0,0,0,0.35), transparent 55%)",
        }}
      />

      {isStory ? (
        // STORY 1080x1920
        <div className="relative h-full w-full flex flex-col">
          {/* Header */}
          <div className="px-16 pt-16 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center ring-2 ring-white/30">
              <Leaf className="w-9 h-9 text-emerald-200" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                ALI Species
              </span>
              <span className="text-sm tracking-[0.25em] uppercase text-emerald-100/80">
                All Life Intelligence
              </span>
            </div>
          </div>

          {/* Image */}
          <div className="mx-16 mt-12 rounded-3xl overflow-hidden bg-black/30 ring-1 ring-white/10 flex-shrink-0" style={{ height: "880px" }}>
            {data.imageUrl ? (
              <img
                src={data.imageUrl}
                alt={data.scientificName}
                crossOrigin="anonymous"
                className="w-full h-full object-cover"
              />
            ) : (
              <FallbackVisual />
            )}
          </div>

          {/* Text */}
          <div className="px-16 pt-10 flex-1 flex flex-col">
            {data.badge && (
              <span className={`self-start px-4 py-1.5 rounded-full text-base font-semibold tracking-wide ${TONE_BG[data.badge.tone]}`}>
                {data.badge.label}
              </span>
            )}
            <h1
              className={`mt-5 font-bold italic leading-tight break-words ${data.scientificName.length > 30 ? "text-5xl" : "text-6xl"}`}
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {data.scientificName}
            </h1>
            {data.vernacular && (
              <p className="mt-3 text-3xl text-emerald-50/95 font-medium">{data.vernacular}</p>
            )}
            {data.fact && (
              <p className="mt-8 text-2xl text-white/85 leading-snug max-w-[900px]">
                {data.fact}
              </p>
            )}
            <div className="mt-auto pb-16 flex items-center justify-between gap-6">
              <div className="flex items-center gap-3 text-emerald-200">
                <Sparkles className="w-7 h-7" />
                <span className="text-2xl font-semibold">{t("share.cta")}</span>
              </div>
              <span className="text-xl tracking-wider text-white/90 font-mono">
                {t("share.siteHandle")}
              </span>
            </div>
          </div>
        </div>
      ) : (
        // LANDSCAPE 1200x630
        <div className="relative h-full w-full flex">
          {/* Image left */}
          <div className="w-[540px] h-full flex-shrink-0 bg-black/30">
            {data.imageUrl ? (
              <img
                src={data.imageUrl}
                alt={data.scientificName}
                crossOrigin="anonymous"
                className="w-full h-full object-cover"
              />
            ) : (
              <FallbackVisual />
            )}
          </div>
          {/* Right column */}
          <div className="flex-1 px-12 py-10 flex flex-col">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center ring-2 ring-white/30">
                <Leaf className="w-7 h-7 text-emerald-200" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  ALI Species
                </span>
                <span className="text-[11px] tracking-[0.25em] uppercase text-emerald-100/80">
                  All Life Intelligence
                </span>
              </div>
            </div>

            {/* Badge */}
            {data.badge && (
              <span className={`mt-7 self-start px-3 py-1 rounded-full text-xs font-semibold tracking-wide ${TONE_BG[data.badge.tone]}`}>
                {data.badge.label}
              </span>
            )}

            {/* Title */}
            <h1
              className={`mt-4 font-bold italic leading-tight break-words ${data.scientificName.length > 28 ? "text-4xl" : "text-5xl"}`}
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {data.scientificName}
            </h1>
            {data.vernacular && (
              <p className="mt-2 text-xl text-emerald-50/95 font-medium">{data.vernacular}</p>
            )}

            {/* Taxonomy hint */}
            {(data.classe || data.famille) && (
              <p className="mt-2 text-sm tracking-widest uppercase text-emerald-200/80">
                {[data.classe, data.famille].filter(Boolean).join(" › ")}
              </p>
            )}

            {/* Fact */}
            {data.fact && (
              <p className="mt-5 text-base text-white/85 leading-snug max-w-[540px]">
                {data.fact}
              </p>
            )}

            {/* CTA */}
            <div className="mt-auto pt-6 flex items-end justify-between gap-4 border-t border-white/15">
              <div className="flex items-center gap-2 text-emerald-200 pt-4">
                <Sparkles className="w-5 h-5" />
                <span className="text-base font-semibold">{t("share.cta")}</span>
              </div>
              <span className="text-sm tracking-wider text-white/90 font-mono pt-4">
                {t("share.siteHandle")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

function FallbackVisual() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_center,#1f7a4f_0%,#0b3d2e_70%)]">
      <Leaf className="w-1/3 h-1/3 text-emerald-200/70" />
    </div>
  );
}
