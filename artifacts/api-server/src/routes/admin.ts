import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, externalCacheTable } from "@workspace/db";

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
 * Ops-only maintenance endpoint. Purges the generic `external_cache` table so
 * lazily-cached upstream responses (EUNIS habitats, Wikipedia, GBIF, ...) are
 * refetched on next access. Unlike the read-only production DB replica exposed
 * to tooling, this runs inside the deployed app and has write access to the
 * live database.
 *
 * Auth: `Authorization: Bearer <ADMIN_TOKEN>` or `x-admin-token: <ADMIN_TOKEN>`.
 * Body (optional): `{ "provider": "eunis_habitats" }` to scope the purge to a
 * single provider; omit to clear every provider.
 */
router.post("/admin/cache/clear", async (req, res): Promise<void> => {
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

export default router;
