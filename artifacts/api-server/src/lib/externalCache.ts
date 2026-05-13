import { and, eq, sql } from "drizzle-orm";
import { db, externalCacheTable, type ExternalCacheEnvelope } from "@workspace/db";
import { logger } from "./logger.js";

export type FetchOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "empty"; error?: string }
  | { kind: "error"; error: string };

export interface CachedOrFetchOptions<T> {
  provider: string;
  cacheKey: string;
  /** TTL for successful (ok / empty) responses. */
  ttlSeconds: number;
  /** TTL for negative-cached errors. Defaults to 5 minutes. */
  errorTtlSeconds?: number;
  /** Live upstream call. Should return one of `{ok, empty, error}`. */
  fetcher: () => Promise<FetchOutcome<T>>;
  /** If true, on upstream error fall back to a stale cached entry if any. */
  allowStaleOnError?: boolean;
  /**
   * Optional reviver to coerce JSON payloads (Date strings, etc.) back to T.
   */
  reviver?: (raw: unknown) => T | null;
}

export interface CachedOrFetchResult<T> {
  data: T | null;
  hit: "fresh" | "stale" | "miss";
  status: "ok" | "empty" | "error";
  error?: string | null;
}

/**
 * Generic upstream cache wrapper. Persists results in `external_cache`
 * (provider, cache_key) and degrades gracefully on error.
 *
 * Behaviour:
 * - Fresh cached row → returns immediately (`hit: "fresh"`).
 * - Cache miss / expired → calls `fetcher()`.
 *   - `ok` → upserts and returns the new payload.
 *   - `empty` → upserts a `{ok:false, data:null}` envelope (negative cache,
 *     short TTL by default) and returns `null`.
 *   - `error` → if a stale row exists and `allowStaleOnError`, returns it
 *     with `hit: "stale"`; otherwise returns `null` with `status: "error"`.
 * - Errors from the cache layer itself never throw — they degrade to a
 *   live fetch and warn-log.
 */
export async function getCachedOrFetch<T>(
  opts: CachedOrFetchOptions<T>,
): Promise<CachedOrFetchResult<T>> {
  const {
    provider, cacheKey, ttlSeconds, fetcher,
    errorTtlSeconds = 300, allowStaleOnError = true, reviver,
  } = opts;

  let cached: typeof externalCacheTable.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(externalCacheTable)
      .where(and(eq(externalCacheTable.provider, provider), eq(externalCacheTable.cacheKey, cacheKey)))
      .limit(1);
    cached = rows[0];
  } catch (err) {
    logger.warn({ err, provider, cacheKey }, "external_cache read failed, falling through to live fetch");
  }

  const now = Date.now();
  if (cached && new Date(cached.expiresAt).getTime() > now) {
    const env = cached.payload as ExternalCacheEnvelope<unknown>;
    const data = env.ok ? (reviver ? reviver(env.data) : (env.data as T)) : null;
    return {
      data,
      hit: "fresh",
      status: env.ok ? "ok" : (cached.status === "empty" ? "empty" : "error"),
      error: env.error ?? null,
    };
  }

  let outcome: FetchOutcome<T>;
  try {
    outcome = await fetcher();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outcome = { kind: "error", error: message };
  }

  if (outcome.kind === "ok") {
    await upsertCache(provider, cacheKey, { ok: true, data: outcome.data }, "ok", null, ttlSeconds);
    return { data: outcome.data, hit: "miss", status: "ok" };
  }

  if (outcome.kind === "empty") {
    await upsertCache(provider, cacheKey, { ok: true, data: null }, "empty", outcome.error ?? null, ttlSeconds);
    return { data: null, hit: "miss", status: "empty", error: outcome.error ?? null };
  }

  // error
  if (allowStaleOnError && cached) {
    const env = cached.payload as ExternalCacheEnvelope<unknown>;
    const data = env.ok ? (reviver ? reviver(env.data) : (env.data as T)) : null;
    logger.warn({ provider, cacheKey, err: outcome.error }, "external upstream failed, serving stale cache");
    return { data, hit: "stale", status: env.ok ? "ok" : "error", error: outcome.error };
  }
  // Negative cache the error briefly so we don't hammer a broken upstream.
  await upsertCache(
    provider, cacheKey,
    { ok: false, data: null, error: outcome.error },
    "error", outcome.error, errorTtlSeconds,
  );
  return { data: null, hit: "miss", status: "error", error: outcome.error };
}

async function upsertCache(
  provider: string,
  cacheKey: string,
  envelope: ExternalCacheEnvelope<unknown>,
  status: "ok" | "empty" | "error",
  errorMessage: string | null,
  ttlSeconds: number,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await db
      .insert(externalCacheTable)
      .values({
        provider,
        cacheKey,
        payload: envelope,
        status,
        errorMessage,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [externalCacheTable.provider, externalCacheTable.cacheKey],
        set: {
          payload: envelope,
          status,
          errorMessage,
          fetchedAt: sql`now()`,
          expiresAt,
        },
      });
  } catch (err) {
    logger.warn({ err, provider, cacheKey }, "external_cache upsert failed");
  }
}
