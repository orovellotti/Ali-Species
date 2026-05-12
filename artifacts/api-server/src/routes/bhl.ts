import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  taxonsTable,
  bhlCacheTable,
  type BhlPayload,
  type BhlReference,
} from "@workspace/db";

const router: IRouter = Router();

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BHL_API = "https://www.biodiversitylibrary.org/api3";
const BHL_TIMEOUT_MS = 15_000;

interface BhlAuthor {
  Name?: string;
}

interface BhlRawResult {
  BHLType?: string;
  ItemID?: number | string;
  TitleID?: number | string;
  Title?: string;
  FullTitle?: string;
  ItemUrl?: string;
  TitleUrl?: string;
  Date?: string;
  PublicationDate?: string;
  Authors?: Array<BhlAuthor | string>;
}

interface BhlSearchResponse {
  Status?: string;
  Result?: BhlRawResult[];
}

function pickName(nomValide: string | null, lbNom: string): string {
  const base = nomValide ?? lbNom;
  return base.split(/\s+/).slice(0, 2).join(" ").trim();
}

function normaliseAuthors(authors: BhlRawResult["Authors"]): string | null {
  if (!Array.isArray(authors) || authors.length === 0) return null;
  const names = authors
    .map((a) => (typeof a === "string" ? a : a?.Name ?? ""))
    .map((s) => s.trim())
    .filter(Boolean);
  return names.length > 0 ? names.join("; ") : null;
}

const BHL_HOST_RE = /^([a-z0-9-]+\.)*biodiversitylibrary\.org$/i;

function safeBhlUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!BHL_HOST_RE.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function toRef(r: BhlRawResult): BhlReference | null {
  const itemId = r.ItemID != null ? Number(r.ItemID) : null;
  const titleId = r.TitleID != null ? Number(r.TitleID) : null;
  const title = String(r.Title ?? r.FullTitle ?? "").trim();
  const candidate =
    safeBhlUrl(r.ItemUrl) ??
    safeBhlUrl(r.TitleUrl) ??
    (itemId && Number.isFinite(itemId) ? `https://www.biodiversitylibrary.org/item/${itemId}` : null) ??
    (titleId && Number.isFinite(titleId) ? `https://www.biodiversitylibrary.org/bibliography/${titleId}` : null);
  if (!title || !candidate) return null;
  return {
    itemId: Number.isFinite(itemId) ? itemId : null,
    titleId: Number.isFinite(titleId) ? titleId : null,
    title,
    authors: normaliseAuthors(r.Authors),
    date: r.Date ?? r.PublicationDate ?? null,
    url: candidate,
    bhlType: r.BHLType ?? null,
  };
}

async function fetchFromBhl(name: string): Promise<BhlPayload | null> {
  const apikey = process.env.BHL_API_KEY;
  if (!apikey) return null;
  const url = `${BHL_API}?op=PublicationSearch&searchterm=${encodeURIComponent(
    name,
  )}&searchtype=C&page=1&format=json&apikey=${encodeURIComponent(apikey)}`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(BHL_TIMEOUT_MS),
      headers: { "User-Agent": "ALi-Species/1.0 (+https://alispecies.io)" },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as BhlSearchResponse;
    if (data.Status !== "ok" || !Array.isArray(data.Result)) {
      return {
        scientificName: name,
        references: [],
        fetchedAt: new Date().toISOString(),
        source: "biodiversitylibrary.org",
      };
    }
    const references = data.Result.slice(0, 50)
      .map(toRef)
      .filter((r): r is BhlReference => r !== null);
    return {
      scientificName: name,
      references,
      fetchedAt: new Date().toISOString(),
      source: "biodiversitylibrary.org",
    };
  } catch {
    return null;
  }
}

export type BhlReason = "ok" | "not_found" | "key_missing" | "upstream_error";

export interface BhlResult {
  reason: BhlReason;
  payload: BhlPayload | null;
}

export async function getBhlForCdNom(cdNom: number): Promise<BhlResult> {
  const [taxon] = await db
    .select({ lbNom: taxonsTable.lbNom, nomValide: taxonsTable.nomValide })
    .from(taxonsTable)
    .where(eq(taxonsTable.cdNom, cdNom));
  if (!taxon) return { reason: "not_found", payload: null };
  const name = pickName(taxon.nomValide, taxon.lbNom);
  if (!name) return { reason: "not_found", payload: null };

  const [cached] = await db
    .select()
    .from(bhlCacheTable)
    .where(eq(bhlCacheTable.cdNom, cdNom));
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return { reason: "ok", payload: cached.payload as BhlPayload };
  }

  if (!process.env.BHL_API_KEY) {
    if (cached) return { reason: "ok", payload: cached.payload as BhlPayload };
    return { reason: "key_missing", payload: null };
  }

  const fresh = await fetchFromBhl(name);
  if (!fresh) {
    if (cached) return { reason: "ok", payload: cached.payload as BhlPayload };
    return { reason: "upstream_error", payload: null };
  }
  await db
    .insert(bhlCacheTable)
    .values({ cdNom, payload: fresh })
    .onConflictDoUpdate({
      target: bhlCacheTable.cdNom,
      set: { payload: fresh, fetchedAt: new Date() },
    });
  return { reason: "ok", payload: fresh };
}

router.get("/taxons/:cdNom/bhl", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.cdNom) ? req.params.cdNom[0] : req.params.cdNom;
  const cdNom = parseInt(raw, 10);
  if (isNaN(cdNom)) {
    res.status(400).json({ error: "Invalid cdNom" });
    return;
  }
  const { reason, payload } = await getBhlForCdNom(cdNom);
  if (reason === "not_found") {
    res.status(404).json({
      scientificName: null,
      references: [],
      source: "biodiversitylibrary.org",
      unavailable: true,
      message: `Taxon cd_nom=${cdNom} introuvable.`,
    });
    return;
  }
  if (reason === "key_missing") {
    res.status(503).json({
      scientificName: null,
      references: [],
      source: "biodiversitylibrary.org",
      unavailable: true,
      message:
        "BHL_API_KEY non configurée sur le serveur. Demander une clé gratuite sur https://www.biodiversitylibrary.org/getapikey.aspx",
    });
    return;
  }
  if (reason === "upstream_error" || !payload) {
    res.status(502).json({
      scientificName: null,
      references: [],
      source: "biodiversitylibrary.org",
      unavailable: true,
      message: "BHL momentanément indisponible. Réessayer plus tard.",
    });
    return;
  }
  res.setHeader(
    "Cache-Control",
    "public, max-age=43200, stale-while-revalidate=86400",
  );
  res.json(payload);
});

export default router;
