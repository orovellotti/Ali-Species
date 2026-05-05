import { Router, type IRouter } from "express";
import { createReadStream, statSync, existsSync, readFileSync, readdirSync } from "node:fs";
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

interface LatestDump {
  dir: string;
  ttlPath: string;
  ttlName: string;
  statsPath: string | null;
}

function findLatestDump(): LatestDump | null {
  const dir = findExportDir();
  if (!dir) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((n) => n.endsWith(".ttl.gz"));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;
  entries.sort();
  const ttlName = entries[entries.length - 1];
  const ttlPath = resolve(dir, ttlName);
  // Couple stats by shared prefix: ali-species-<id>.ttl.gz ↔ ali-species-<id>.stats.csv
  const statsName = ttlName.replace(/\.ttl\.gz$/, ".stats.csv");
  const statsPath = resolve(dir, statsName);
  return {
    dir,
    ttlPath,
    ttlName,
    statsPath: existsSync(statsPath) ? statsPath : null,
  };
}

router.get("/exports/info", (_req, res) => {
  const latest = findLatestDump();
  const out: Record<string, unknown> = { available: !!latest };
  if (latest) {
    const s = statSync(latest.ttlPath);
    out.ttl = {
      filename: latest.ttlName,
      sizeBytes: s.size,
      sizeMb: Math.round((s.size / (1024 * 1024)) * 10) / 10,
      mtime: s.mtime.toISOString(),
      url: "/api/exports/rdf.ttl.gz",
    };
    if (latest.statsPath) {
      try {
        const lines = readFileSync(latest.statsPath, "utf8").trim().split("\n").slice(1);
        const parsed: Record<string, string> = {};
        for (const ln of lines) {
          const [k, v] = ln.split(",");
          if (k && v !== undefined) parsed[k] = v;
        }
        out.stats = parsed;
      } catch {
        // stats unreadable — leave undefined
      }
    }
  }
  res.json(out);
});

router.get("/exports/rdf.ttl.gz", (req, res) => {
  const latest = findLatestDump();
  if (!latest) {
    res.status(404).json({ error: "Dump RDF non disponible." });
    return;
  }
  const s = statSync(latest.ttlPath);
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Length", s.size);
  res.setHeader("Content-Disposition", `attachment; filename="${latest.ttlName}"`);
  res.setHeader("Cache-Control", "public, max-age=3600");
  const stream = createReadStream(latest.ttlPath);
  stream.on("error", (err) => {
    req.log?.error({ err }, "rdf dump stream error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Erreur de lecture du dump." });
    } else {
      res.destroy(err);
    }
  });
  stream.pipe(res);
});

router.get("/exports/stats.csv", (req, res) => {
  const latest = findLatestDump();
  if (!latest || !latest.statsPath) {
    res.status(404).json({ error: "Stats non disponibles." });
    return;
  }
  const statsName = latest.statsPath.split("/").pop() ?? "ali-species-stats.csv";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${statsName}"`);
  const stream = createReadStream(latest.statsPath);
  stream.on("error", (err) => {
    req.log?.error({ err }, "stats csv stream error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Erreur de lecture des stats." });
    } else {
      res.destroy(err);
    }
  });
  stream.pipe(res);
});

export default router;
