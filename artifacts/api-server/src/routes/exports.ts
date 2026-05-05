import { Router, type IRouter } from "express";
import { createReadStream, statSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const router: IRouter = Router();

function findExportDir(): string | null {
  const candidates = [
    resolve(process.cwd(), "exports"),
    resolve(process.cwd(), "../exports"),
    resolve(process.cwd(), "../../exports"),
    "/home/runner/workspace/exports",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function findFile(name: string): string | null {
  const dir = findExportDir();
  if (!dir) return null;
  const full = resolve(dir, name);
  return existsSync(full) ? full : null;
}

function findLatestTtlGz(): string | null {
  const dir = findExportDir();
  if (!dir) return null;
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const entries = fs.readdirSync(dir).filter((n) => n.endsWith(".ttl.gz"));
    if (entries.length === 0) return null;
    entries.sort();
    return resolve(dir, entries[entries.length - 1]);
  } catch {
    return null;
  }
}

router.get("/exports/info", (_req, res) => {
  const ttl = findLatestTtlGz();
  const stats = findFile("ali-species-bdddeab.stats.csv");
  const out: Record<string, unknown> = { available: !!ttl };
  if (ttl) {
    const s = statSync(ttl);
    out.ttl = {
      filename: ttl.split("/").pop(),
      sizeBytes: s.size,
      sizeMb: Math.round((s.size / (1024 * 1024)) * 10) / 10,
      mtime: s.mtime.toISOString(),
      url: "/api/exports/rdf.ttl.gz",
    };
  }
  if (stats) {
    const lines = readFileSync(stats, "utf8").trim().split("\n").slice(1);
    const parsed: Record<string, string> = {};
    for (const ln of lines) {
      const [k, v] = ln.split(",");
      if (k && v !== undefined) parsed[k] = v;
    }
    out.stats = parsed;
  }
  res.json(out);
});

router.get("/exports/rdf.ttl.gz", (_req, res) => {
  const file = findLatestTtlGz();
  if (!file) {
    res.status(404).json({ error: "Dump RDF non disponible." });
    return;
  }
  const s = statSync(file);
  const filename = file.split("/").pop() ?? "ali-species.ttl.gz";
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Length", s.size);
  res.setHeader("Content-Encoding", "identity");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "public, max-age=3600");
  createReadStream(file).pipe(res);
});

router.get("/exports/stats.csv", (_req, res) => {
  const file = findFile("ali-species-bdddeab.stats.csv");
  if (!file) {
    res.status(404).json({ error: "Stats non disponibles." });
    return;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ali-species-stats.csv"`);
  createReadStream(file).pipe(res);
});

export default router;
