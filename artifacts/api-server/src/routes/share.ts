import { Router, type IRouter } from "express";
import { fetchTaxonRow } from "../lib/profileFetchers.js";
import { readProfileSummary } from "../lib/profileSummary.js";

const router: IRouter = Router();

const SITE_ORIGIN = "https://alispecies.io";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-default.png`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Server-rendered HTML for social previews. Crawlers (LinkedIn / Slack / X)
 * read the OG meta from this static document; human visitors are bounced to
 * the SPA /taxon/:slug page via meta refresh + JS replace.
 */
router.get("/share/taxon/:cdNom", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);
  if (isNaN(cdNom)) { res.status(400).type("text/plain").send("Invalid cdNom"); return; }

  const taxon = await fetchTaxonRow(cdNom);
  if (!taxon) { res.status(404).type("text/plain").send("Taxon not found"); return; }

  const summary = await readProfileSummary(cdNom);
  const slug = `${cdNom}-${slugify(taxon.lbNom)}`;
  const canonical = `${SITE_ORIGIN}/taxon/${slug}`;
  const title = summary?.shareSummary.title
    || (taxon.nomVern ? `${taxon.nomVern} (${taxon.nomValide || taxon.lbNom})` : (taxon.nomValide || taxon.lbNom));
  const description = summary?.shareSummary.description
    || `${taxon.nomVern || taxon.lbNom} — fiche espèce sur ALI Species (TAXREF v18, statuts BdC, GloBI, traits).`;
  const image = summary?.shareSummary.imageUrl
    || `${SITE_ORIGIN}/api/og/taxon/${cdNom}.png`;

  // JSON-LD with sameAs identifiers — even when crawlers index /share they
  // pick up the same entity signals as /taxon/:slug, which consolidates
  // PageRank around the canonical URL.
  const inpnUrl = `https://inpn.mnhn.fr/espece/cd_nom/${cdNom}`;
  const gbifUrl = `https://www.gbif.org/species/search?q=${encodeURIComponent(taxon.lbNom)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Taxon",
    "@id": canonical,
    name: taxon.lbNom,
    alternateName: taxon.nomVern ? taxon.nomVern.split(",").map(s => s.trim()) : undefined,
    scientificName: taxon.nomComplet || taxon.lbNom,
    taxonRank: taxon.rang || undefined,
    url: canonical,
    sameAs: [inpnUrl, gbifUrl],
    image: image,
    description,
    identifier: { "@type": "PropertyValue", name: "CD_NOM", value: cdNom, propertyID: "https://inpn.mnhn.fr/espece/cd_nom" },
    isPartOf: {
      "@type": "Dataset",
      name: "TAXREF v18",
      creator: { "@type": "Organization", name: "PatriNat (OFB - MNHN - CNRS - IRD)" },
    },
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — ALi Species</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta name="robots" content="noindex,follow,max-image-preview:large" />
<link rel="canonical" href="${escapeHtml(canonical)}" />

<meta property="og:type" content="article" />
<meta property="og:site_name" content="ALi Species" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:alt" content="${escapeHtml(title)}" />
<meta property="og:locale" content="fr_FR" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />

<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>

<meta http-equiv="refresh" content="0; url=${escapeHtml(canonical)}" />
<script>window.location.replace(${JSON.stringify(canonical)});</script>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:1rem;color:#1f2937}a{color:#059669}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(canonical)}">Voir la fiche complète sur ALi Species &rarr;</a></p>
</body>
</html>`;

  res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=3600");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

/**
 * v1 OG image route: 302 redirect to the best Wikimedia image (cached via
 * profile summary). Returns the brand fallback when no image is available.
 * v2 (future): server-render a Satori card.
 */
export function registerOgRoute(apiRouter: IRouter): void {
  apiRouter.get("/og/taxon/:cdNom.png", async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
    const cdNom = parseInt(raw, 10);
    if (isNaN(cdNom)) { res.status(400).end(); return; }
    const summary = await readProfileSummary(cdNom);
    const url = summary?.shareSummary.imageUrl || DEFAULT_OG_IMAGE;
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.redirect(302, url);
  });
}

export default router;
