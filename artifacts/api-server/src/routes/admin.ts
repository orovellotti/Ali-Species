import express, { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, externalCacheTable, habrefHabitatsTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * Constant-time comparison of the caller-supplied token against ADMIN_TOKEN.
 * Returns false when either side is missing or lengths differ.
 */
function tokenValid(provided: string | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Express middleware gating an admin route on ADMIN_TOKEN. Runs before any body
 * parser so an unauthenticated caller is rejected before we spend work on the
 * request body. Auth: `Authorization: Bearer <ADMIN_TOKEN>` or `x-admin-token`.
 */
function adminGuard(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.ADMIN_TOKEN) {
    res.status(503).json({ error: "ADMIN_TOKEN not configured" });
    return;
  }
  const header = req.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const provided = bearer ?? req.get("x-admin-token") ?? undefined;
  if (!tokenValid(provided)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

/**
 * Ops-only maintenance endpoint. Purges the generic `external_cache` table so
 * lazily-cached upstream responses (EUNIS habitats, Wikipedia, GBIF, ...) are
 * refetched on next access. Unlike the read-only production DB replica exposed
 * to tooling, this runs inside the deployed app and has write access to the
 * live database.
 *
 * Body (optional): `{ "provider": "eunis_habitats" }` to scope the purge to a
 * single provider; omit to clear every provider.
 */
router.post("/admin/cache/clear", adminGuard, async (req, res): Promise<void> => {
  const provider =
    typeof req.body?.provider === "string" && req.body.provider.trim() !== ""
      ? req.body.provider.trim()
      : undefined;

  const result = provider
    ? await db.delete(externalCacheTable).where(eq(externalCacheTable.provider, provider))
    : await db.delete(externalCacheTable);
  const deleted = result.rowCount ?? 0;

  req.log.info({ provider: provider ?? "*", deleted }, "admin cache clear");
  res.json({ ok: true, provider: provider ?? null, deleted });
});

interface HabrefHabitatInput {
  code: string;
  label: string;
}
interface HabrefRowInput {
  cdRef: number;
  habitats: HabrefHabitatInput[];
}

/** Upper bound guarding against absurd payloads; TAXREF has ~708k taxa total. */
const MAX_HABREF_ROWS = 1_000_000;

/**
 * Ops-only bulk loader for the offline HABREF species→habitat table. The source
 * CSVs are parsed in development (see `scripts/src/import-habref.ts`); this
 * endpoint receives the already-aggregated rows and replaces the live table
 * atomically. It exists because the production database is only writable from
 * inside the deployed app, not from the read-only tooling replica.
 *
 * The large body is parsed only after `adminGuard`, so an unauthenticated
 * caller cannot force a big pre-auth JSON parse.
 *
 * Body: `{ "rows": [{ "cdRef": number, "habitats": [{ "code", "label" }] }] }`.
 * Replacement is atomic and refuses to run on an empty payload so a bad request
 * can never wipe the table.
 */
router.post(
  "/admin/habref/import",
  adminGuard,
  express.json({ limit: "32mb" }),
  async (req, res): Promise<void> => {
    const rawRows: unknown = req.body?.rows;
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      res.status(400).json({ error: "rows must be a non-empty array" });
      return;
    }
    if (rawRows.length > MAX_HABREF_ROWS) {
      res.status(400).json({ error: `too many rows (max ${MAX_HABREF_ROWS})` });
      return;
    }

    // Dedup by cdRef (last wins): the table PK is cd_ref, so duplicates in the
    // payload would otherwise abort the transaction on a PK violation.
    const byRef = new Map<number, HabrefHabitatInput[]>();
    for (const r of rawRows) {
      const cdRef = (r as { cdRef?: unknown })?.cdRef;
      const habitats = (r as { habitats?: unknown })?.habitats;
      if (typeof cdRef !== "number" || !Number.isInteger(cdRef)) {
        res.status(400).json({ error: "each row needs an integer cdRef" });
        return;
      }
      if (
        !Array.isArray(habitats) ||
        habitats.length === 0 ||
        !habitats.every((h) => {
          const code = (h as { code?: unknown })?.code;
          const label = (h as { label?: unknown })?.label;
          return typeof code === "string" && code.trim() !== "" && typeof label === "string" && label.trim() !== "";
        })
      ) {
        res.status(400).json({ error: `row ${cdRef}: habitats must be a non-empty {code,label}[]` });
        return;
      }
      byRef.set(
        cdRef,
        (habitats as HabrefHabitatInput[]).map((h) => ({ code: h.code, label: h.label })),
      );
    }

    const rows: HabrefRowInput[] = [...byRef.entries()].map(([cdRef, habitats]) => ({
      cdRef,
      habitats,
    }));

    await db.transaction(async (tx) => {
      await tx.delete(habrefHabitatsTable);
      const BATCH = 500;
      for (let start = 0; start < rows.length; start += BATCH) {
        const slice = rows.slice(start, start + BATCH);
        await tx.insert(habrefHabitatsTable).values(
          slice.map((r) => ({ cdRef: r.cdRef, habitats: r.habitats })),
        );
      }
    });

    req.log.info({ rows: rows.length }, "admin habref import");
    res.json({ ok: true, rows: rows.length });
  },
);

export default router;
