import { Router, type IRouter } from "express";
import { db, taxonsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const SITE_ORIGIN = "https://alispecies.io";
// Sitemaps.org spec: max 50 000 URLs per file. We use 45 000 to keep headroom.
const CHUNK_SIZE = 45_000;
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

// Caches
let countCache: { count: number; at: number } | null = null;
const chunkCache = new Map<number, { xml: string; at: number }>();
let indexCache: { xml: string; at: number } | null = null;

async function getTotalReferenceSpeciesCount(): Promise<number> {
  const now = Date.now();
  if (countCache && now - countCache.at < CACHE_TTL_MS) return countCache.count;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(taxonsTable)
    .where(
      and(
        eq(taxonsTable.rang, "ES"),
        eq(taxonsTable.cdNom, taxonsTable.cdRef),
      ),
    );
  const count = row?.n ?? 0;
  countCache = { count, at: now };
  return count;
}

async function buildChunkXml(chunkIndex: number): Promise<string | null> {
  const total = await getTotalReferenceSpeciesCount();
  const totalChunks = Math.max(1, Math.ceil(total / CHUNK_SIZE));
  if (chunkIndex < 1 || chunkIndex > totalChunks) return null;

  const now = Date.now();
  const cached = chunkCache.get(chunkIndex);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.xml;

  const offset = (chunkIndex - 1) * CHUNK_SIZE;
  const rows = await db
    .select({
      cdNom: taxonsTable.cdNom,
      lbNom: taxonsTable.lbNom,
      nomVern: taxonsTable.nomVern,
    })
    .from(taxonsTable)
    .where(
      and(
        eq(taxonsTable.rang, "ES"),
        eq(taxonsTable.cdNom, taxonsTable.cdRef),
      ),
    )
    // Stable, deterministic ordering: vernacular-named species first (more
    // important for search), then by cdNom ascending. This makes chunk N
    // identical across requests/regenerations.
    .orderBy(
      sql`CASE WHEN ${taxonsTable.nomVern} IS NOT NULL AND ${taxonsTable.nomVern} <> '' THEN 0 ELSE 1 END`,
      taxonsTable.cdNom,
    )
    .limit(CHUNK_SIZE)
    .offset(offset);

  const urls = rows
    .map((r) => {
      const slug = r.lbNom ? slugify(r.lbNom) : "";
      const path = slug
        ? `/taxon/${r.cdNom}-${slug}`
        : `/taxon/${r.cdNom}`;
      // Higher priority for vernacular-named species (more searched).
      const priority = r.nomVern ? "0.7" : "0.5";
      return `  <url><loc>${escapeXml(SITE_ORIGIN + path)}</loc><changefreq>monthly</changefreq><priority>${priority}</priority></url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  chunkCache.set(chunkIndex, { xml, at: now });
  return xml;
}

async function buildIndexXml(): Promise<string> {
  const now = Date.now();
  if (indexCache && now - indexCache.at < CACHE_TTL_MS) return indexCache.xml;

  const total = await getTotalReferenceSpeciesCount();
  const totalChunks = Math.max(1, Math.ceil(total / CHUNK_SIZE));
  const lastmod = new Date().toISOString().slice(0, 10);

  const entries: string[] = [];
  for (let i = 1; i <= totalChunks; i++) {
    entries.push(`  <sitemap><loc>${SITE_ORIGIN}/api/sitemap-taxa-${i}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>\n`;
  indexCache = { xml, at: now };
  return xml;
}

/**
 * Sitemap index: lists every per-chunk sitemap.
 * Total coverage: ~all reference species (cdRef = cdNom, rang = ES) from TAXREF v18.
 */
router.get("/sitemap-index.xml", async (req, res) => {
  try {
    const xml = await buildIndexXml();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "sitemap-index generation failed");
    res.status(500).type("text/plain").send("sitemap generation failed");
  }
});

/**
 * Per-chunk sitemap. Numbered from 1.
 */
router.get("/sitemap-taxa-:n.xml", async (req, res) => {
  try {
    const raw = Array.isArray(req.params.n) ? req.params.n[0] : req.params.n;
    const n = parseInt(raw ?? "", 10);
    if (!Number.isFinite(n) || n < 1) {
      res.status(400).type("text/plain").send("Invalid chunk number");
      return;
    }
    const xml = await buildChunkXml(n);
    if (!xml) { res.status(404).type("text/plain").send("Chunk out of range"); return; }
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "sitemap-taxa chunk generation failed");
    res.status(500).type("text/plain").send("sitemap generation failed");
  }
});

/**
 * Legacy single-file route — kept for backward compatibility. Returns chunk 1
 * so that anyone still pointing at the old URL (Google Search Console, etc.)
 * doesn't 404. New crawls should follow /sitemap-index.xml.
 */
router.get("/sitemap-taxa.xml", async (req, res) => {
  try {
    const xml = await buildChunkXml(1);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(xml ?? "");
  } catch (err) {
    req.log.error({ err }, "sitemap-taxa legacy generation failed");
    res.status(500).type("text/plain").send("sitemap generation failed");
  }
});

export default router;
