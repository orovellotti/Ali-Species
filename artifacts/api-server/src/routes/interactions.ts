import { Router, type IRouter } from "express";
import { inArray, eq, and } from "drizzle-orm";
import { db, taxonsTable } from "@workspace/db";

const router: IRouter = Router();

const GLOBI_BASE = "https://api.globalbioticinteractions.org";
const CACHE_TTL_MS = 60 * 60 * 1000;
const GLOBI_TIMEOUT_MS = 10000;

const FOOD_GROUPS = [
  { id: "consumes", label: "Se nourrit de", types: ["eats", "preysOn"] },
  { id: "consumedBy", label: "Est consommé par", types: ["eatenBy", "preyedUponBy"] },
  { id: "parasites", label: "Parasites / hôtes", types: ["hasParasite", "parasiteOf", "hasEctoparasite", "hasEndoparasite"] },
  { id: "pollination", label: "Pollinisation", types: ["pollinatedBy", "pollinates", "visitedBy", "visits"] },
] as const;

interface GlobiAggregate {
  columns: string[];
  data: Array<[string, string, string[]]>;
}

export interface InteractionPartner {
  name: string;
  cdNom: number | null;
  rang: string | null;
  nomVern: string | null;
}

export interface InteractionGroup {
  id: string;
  label: string;
  count: number;
  partners: InteractionPartner[];
}

export interface InteractionsPayload {
  sourceTaxon: string;
  cdNom: number;
  totalPartners: number;
  groups: InteractionGroup[];
  attribution: { source: string; url: string };
}

interface CacheEntry {
  at: number;
  payload: InteractionsPayload;
}

const cache = new Map<number, CacheEntry>();

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && Date.now() - entry.at < CACHE_TTL_MS;
}

export async function getInteractionsForCdNom(
  cdNom: number,
): Promise<InteractionsPayload | null> {
  const cached = cache.get(cdNom);
  if (isFresh(cached)) return cached.payload;

  const [taxon] = await db
    .select({ cdNom: taxonsTable.cdNom, lbNom: taxonsTable.lbNom, rang: taxonsTable.rang })
    .from(taxonsTable)
    .where(eq(taxonsTable.cdNom, cdNom))
    .limit(1);
  if (!taxon || !taxon.lbNom) return null;

  const allCalls = FOOD_GROUPS.flatMap((g) => g.types.map((t) => ({ groupId: g.id, type: t })));
  const settled = await Promise.allSettled(allCalls.map((c) => fetchGlobiGroup(taxon.lbNom!, c.type)));

  const partnersByGroup = new Map<string, Set<string>>();
  for (const g of FOOD_GROUPS) partnersByGroup.set(g.id, new Set());
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      const set = partnersByGroup.get(allCalls[i].groupId)!;
      for (const name of s.value) set.add(name);
    }
  });

  const allNames = new Set<string>();
  for (const set of partnersByGroup.values()) for (const n of set) allNames.add(n);

  const nameToTaxon = new Map<
    string,
    { cdNom: number; lbNom: string; rang: string | null; nomVern: string | null }
  >();
  if (allNames.size > 0) {
    const matches = await db
      .select({
        cdNom: taxonsTable.cdNom,
        lbNom: taxonsTable.lbNom,
        rang: taxonsTable.rang,
        nomVern: taxonsTable.nomVern,
      })
      .from(taxonsTable)
      .where(and(
        inArray(taxonsTable.lbNom, [...allNames]),
        eq(taxonsTable.cdNom, taxonsTable.cdRef),
      ));
    for (const m of matches) {
      if (m.lbNom && !nameToTaxon.has(m.lbNom)) {
        nameToTaxon.set(m.lbNom, {
          cdNom: m.cdNom,
          lbNom: m.lbNom,
          rang: m.rang,
          nomVern: m.nomVern,
        });
      }
    }
  }

  const groups: InteractionGroup[] = FOOD_GROUPS.map((g) => {
    const partners: InteractionPartner[] = [...partnersByGroup.get(g.id)!]
      .map((name) => {
        const match = nameToTaxon.get(name);
        return {
          name,
          cdNom: match?.cdNom ?? null,
          rang: match?.rang ?? null,
          nomVern: match?.nomVern ?? null,
        };
      })
      .sort((a, b) => {
        if (!!a.cdNom !== !!b.cdNom) return a.cdNom ? -1 : 1;
        return a.name.localeCompare(b.name, "fr");
      });
    return { id: g.id, label: g.label, count: partners.length, partners };
  }).filter((g) => g.count > 0);

  const totalPartners = groups.reduce((s, g) => s + g.count, 0);
  const payload: InteractionsPayload = {
    sourceTaxon: taxon.lbNom,
    cdNom: taxon.cdNom,
    totalPartners,
    groups,
    attribution: {
      source: "Global Biotic Interactions (GloBI)",
      url: `https://www.globalbioticinteractions.org/?interactionType=interactsWith&sourceTaxon=${encodeURIComponent(taxon.lbNom)}`,
    },
  };

  cache.set(cdNom, { at: Date.now(), payload });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return payload;
}

async function fetchGlobiGroup(taxonName: string, type: string): Promise<string[]> {
  const url = `${GLOBI_BASE}/taxon/${encodeURIComponent(taxonName)}/${encodeURIComponent(type)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": "AliSpecies/1.0 (https://ali-species.replit.app)" },
    signal: AbortSignal.timeout(GLOBI_TIMEOUT_MS),
  });
  if (!r.ok) return [];
  const json = (await r.json()) as GlobiAggregate;
  const out = new Set<string>();
  for (const row of json.data ?? []) {
    const targets = row[2];
    if (Array.isArray(targets)) for (const t of targets) if (t && typeof t === "string") out.add(t);
  }
  return [...out];
}

export function _clearInteractionsCache(): void {
  cache.clear();
}

router.get("/taxons/:cdNom/interactions", async (req, res): Promise<void> => {
  const cdNom = parseInt(req.params.cdNom, 10);
  if (!cdNom || Number.isNaN(cdNom)) {
    res.status(400).json({ error: "invalid cdNom" });
    return;
  }
  const wasFresh = isFresh(cache.get(cdNom));
  try {
    const payload = await getInteractionsForCdNom(cdNom);
    if (!payload) {
      res.status(404).json({ error: "taxon not found" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Cache", wasFresh ? "HIT" : "MISS");
    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: "interactions service unavailable" });
  }
});

export default router;
