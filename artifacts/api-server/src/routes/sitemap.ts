import { Router, type IRouter } from "express";
import { db, taxonsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const SITE_ORIGIN = "https://alispecies.io";
const MAX_URLS = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

let cache: { xml: string; at: number } | null = null;

router.get("/sitemap-taxa.xml", async (req, res) => {
  try {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_TTL_MS) {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(cache.xml);
      return;
    }

    const rows = await db
      .select({
        cdNom: taxonsTable.cdNom,
        lbNom: taxonsTable.lbNom,
      })
      .from(taxonsTable)
      .where(
        and(
          eq(taxonsTable.rang, "ES"),
          eq(taxonsTable.cdNom, taxonsTable.cdRef),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${taxonsTable.nomVern} IS NOT NULL AND ${taxonsTable.nomVern} <> '' THEN 0 ELSE 1 END`,
        taxonsTable.cdNom,
      )
      .limit(MAX_URLS);

    const urls = rows
      .map((r) => {
        const slug = r.lbNom ? slugify(r.lbNom) : "";
        const path = slug
          ? `/taxon/${r.cdNom}-${slug}`
          : `/taxon/${r.cdNom}`;
        return `  <url><loc>${escapeXml(SITE_ORIGIN + path)}</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

    cache = { xml, at: now };
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "sitemap-taxa generation failed");
    res.status(500).type("text/plain").send("sitemap generation failed");
  }
});

export default router;
