import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { taxonUrl, formatRank } from "@/lib/constants";
import type { ShareCardData } from "@/components/ShareDiscoveryCard";

export type ShareableTaxon = {
  cdNom: number;
  lbNom: string;
  nomVern?: string | null;
  rang: string;
  classe?: string | null;
  famille?: string | null;
};

/**
 * Encapsulates the "open share modal for taxon X" flow:
 *  - debounce against double-clicks (sharingCdNom guard)
 *  - fetch /profile to enrich the card (image, sensitivity, statuts → fact)
 *  - graceful fallback to a minimal card on any error
 *  - build the canonical shareable URL
 */
export function useShareTaxon() {
  const { t } = useTranslation();
  const [shareData, setShareData] = useState<ShareCardData | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [sharingCdNom, setSharingCdNom] = useState<number | null>(null);

  const openShareFor = useCallback(
    async (r: ShareableTaxon) => {
      if (sharingCdNom !== null) return;
      setSharingCdNom(r.cdNom);
      try {
        const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
        let imageUrl: string | null = null;
        let imageCredit: string | null = null;
        let badge: ShareCardData["badge"] = null;
        let fact: string | null = null;
        let lbAuteur: string | null = null;
        let classe: string | null = r.classe ?? null;
        let famille: string | null = r.famille ?? null;
        try {
          const resp = await fetch(`${baseUrl}/api/taxons/${r.cdNom}/profile`);
          if (resp.ok) {
            const p = await resp.json();
            const firstImg = p.media && !("error" in p.media) ? p.media.images?.[0] : null;
            if (firstImg?.url) {
              imageUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(firstImg.url)}`;
              imageCredit = firstImg.author ?? null;
            }
            if (p.sensitivity?.score > 0 && p.sensitivity.drivers?.length > 0) {
              const tone: NonNullable<ShareCardData["badge"]>["tone"] =
                p.sensitivity.score >= 80 ? "danger" : p.sensitivity.score >= 50 ? "warning" : "info";
              badge = { label: p.sensitivity.drivers[0].label, tone };
            }
            const codes = new Set<string>(
              (p.statuts ?? [])
                .map((s: { codeStatut: string | null }) => s.codeStatut)
                .filter((x: unknown): x is string => !!x),
            );
            const types = new Set<string>(
              (p.statuts ?? [])
                .map((s: { cdTypeStatut: string | null }) => s.cdTypeStatut)
                .filter((x: unknown): x is string => !!x),
            );
            if (codes.has("CR")) fact = t("share.factRedListCR");
            else if (codes.has("EN")) fact = t("share.factRedListEN");
            else if (codes.has("VU")) fact = t("share.factRedListVU");
            else if (types.has("PN") || types.has("PR") || types.has("PD")) fact = t("share.factProtected");
            else if (Array.from(types).some((tt) => tt.startsWith("DH") || tt.startsWith("DO")))
              fact = t("share.factDirective");
            else fact = t("share.fallbackFact");
            lbAuteur = p.taxon?.lbAuteur ?? null;
            classe = p.taxon?.classe ?? classe;
            famille = p.taxon?.famille ?? famille;
          }
        } catch {
          /* ignore — fall back to minimal card */
        }
        if (!fact) fact = t("share.fallbackFact");

        const data: ShareCardData = {
          cdNom: r.cdNom,
          scientificName: r.lbNom,
          author: lbAuteur,
          vernacular: r.nomVern ? r.nomVern.split(",")[0].trim() : null,
          rankLabel: formatRank(r.rang),
          imageUrl,
          imageCredit,
          classe,
          famille,
          fact,
          badge,
        };
        const url = `${window.location.origin}${import.meta.env.BASE_URL}${taxonUrl(r.cdNom, r.lbNom).slice(1)}`;
        setShareData(data);
        setShareUrl(url);
      } finally {
        setSharingCdNom(null);
      }
    },
    [sharingCdNom, t],
  );

  const closeShare = useCallback(() => setShareData(null), []);

  return { shareData, shareUrl, sharingCdNom, openShareFor, closeShare };
}
