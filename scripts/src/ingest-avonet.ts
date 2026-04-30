import { createWriteStream, existsSync, createReadStream, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createInterface } from "readline";
import { inflateRawSync } from "zlib";
import https from "https";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");

const URL_AVONET_ZIP = "https://ndownloader.figshare.com/files/38429873";
const ZIP_CACHE = join(tmpdir(), "eledata.zip");
const CSV_CACHE = join(tmpdir(), "avonet.csv");
const CSV_INNER = "ELEData/TraitData/AVONET1_BirdLife.csv";

function download(url: string, dest: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const file = createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        pipeline(res, file).then(resolve, reject);
      })
      .on("error", reject);
  });
}

function extractCsvFromZip(zipPath: string, innerName: string): Buffer {
  const buf = readFileSync(zipPath);
  let p = buf.length - 22;
  for (; p >= 0; p--) if (buf.readUInt32LE(p) === 0x06054b50) break;
  if (p < 0) throw new Error("EOCD not found");
  const cdOff = buf.readUInt32LE(p + 16);
  const nEnt = buf.readUInt16LE(p + 10);
  let o = cdOff;
  for (let i = 0; i < nEnt; i++) {
    const fnLen = buf.readUInt16LE(o + 28);
    const xLen = buf.readUInt16LE(o + 30);
    const cLen = buf.readUInt16LE(o + 32);
    const cSz = buf.readUInt32LE(o + 20);
    const localOff = buf.readUInt32LE(o + 42);
    const cmp = buf.readUInt16LE(o + 10);
    const name = buf.slice(o + 46, o + 46 + fnLen).toString();
    if (name === innerName) {
      const lh = localOff;
      const lFnLen = buf.readUInt16LE(lh + 26);
      const lXLen = buf.readUInt16LE(lh + 28);
      const dataOff = lh + 30 + lFnLen + lXLen;
      const data = buf.slice(dataOff, dataOff + cSz);
      return cmp === 8 ? inflateRawSync(data) : data;
    }
    o += 46 + fnLen + xLen + cLen;
  }
  throw new Error(`File ${innerName} not in ZIP`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') q = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

interface DbTrait { label: string; value: string; unit?: string; raw?: number | string; }

function fmtNumber(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  if (abs >= 10) return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  if (abs >= 1) return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

const NUMERIC_FIELDS: Array<{ col: string; key: string; label: string; unit?: string }> = [
  { col: "Mass", key: "mass", label: "Masse", unit: "g" },
  { col: "Beak.Length_Culmen", key: "beakLenCulmen", label: "Bec (longueur, culmen)", unit: "mm" },
  { col: "Beak.Length_Nares", key: "beakLenNares", label: "Bec (longueur, narines)", unit: "mm" },
  { col: "Beak.Width", key: "beakWidth", label: "Bec (largeur)", unit: "mm" },
  { col: "Beak.Depth", key: "beakDepth", label: "Bec (profondeur)", unit: "mm" },
  { col: "Tarsus.Length", key: "tarsusLen", label: "Tarse (longueur)", unit: "mm" },
  { col: "Wing.Length", key: "wingLen", label: "Aile (longueur)", unit: "mm" },
  { col: "Kipps.Distance", key: "kippsDist", label: "Distance de Kipp", unit: "mm" },
  { col: "Secondary1", key: "secondary1", label: "Plume secondaire S1", unit: "mm" },
  { col: "Hand-Wing.Index", key: "handWingIdx", label: "Indice main-aile" },
  { col: "Tail.Length", key: "tailLen", label: "Queue (longueur)", unit: "mm" },
  { col: "Range.Size", key: "rangeSize", label: "Aire de répartition", unit: "× 10³ km²" },
];

const HABITAT_TRANSLATE: Record<string, string> = {
  Forest: "Forêt",
  Woodland: "Forêt claire",
  Shrubland: "Maquis / arbustif",
  Grassland: "Prairies",
  Wetland: "Zones humides",
  Rock: "Milieux rocheux",
  Coastal: "Côtier",
  Marine: "Marin",
  Desert: "Désert",
  "Human Modified": "Anthropisé",
  Riverine: "Riverain",
};
const MIGRATION_TRANSLATE: Record<string, string> = {
  "1": "Sédentaire",
  "2": "Migration partielle",
  "3": "Migrateur",
};
const TROPHIC_LEVEL_TRANSLATE: Record<string, string> = {
  Carnivore: "Carnivore",
  Herbivore: "Herbivore",
  Omnivore: "Omnivore",
  Scavenger: "Charognard",
};
const TROPHIC_NICHE_TRANSLATE: Record<string, string> = {
  Vertivore: "Vertivore (vertébrés)",
  Invertivore: "Invertivore",
  "Aquatic predator": "Prédateur aquatique",
  Scavenger: "Charognard",
  Frugivore: "Frugivore",
  Granivore: "Granivore",
  Nectarivore: "Nectarivore",
  "Herbivore terrestrial": "Herbivore terrestre",
  "Herbivore aquatic": "Herbivore aquatique",
  Omnivore: "Omnivore",
};
const LIFESTYLE_TRANSLATE: Record<string, string> = {
  Aerial: "Aérien",
  Terrestrial: "Terrestre",
  Insessorial: "Percheur (arboricole)",
  Aquatic: "Aquatique",
  Generalist: "Généraliste",
};

function txt(row: Record<string, string>, col: string, map: Record<string, string>): string | null {
  const raw = (row[col] || "").trim();
  if (!raw || raw === "NA") return null;
  return map[raw] || raw;
}

function buildTraits(row: Record<string, string>): Record<string, DbTrait> {
  const out: Record<string, DbTrait> = {};
  for (const f of NUMERIC_FIELDS) {
    const raw = row[f.col];
    if (!raw || raw === "NA") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out[f.key] = { label: f.label, value: fmtNumber(n), unit: f.unit, raw: n };
  }
  const hab = txt(row, "Habitat", HABITAT_TRANSLATE);
  if (hab) out.habitat = { label: "Habitat", value: hab };
  const mig = txt(row, "Migration", MIGRATION_TRANSLATE);
  if (mig) out.migration = { label: "Comportement migratoire", value: mig };
  const tl = txt(row, "Trophic.Level", TROPHIC_LEVEL_TRANSLATE);
  if (tl) out.trophicLevel = { label: "Niveau trophique", value: tl };
  const tn = txt(row, "Trophic.Niche", TROPHIC_NICHE_TRANSLATE);
  if (tn) out.trophicNiche = { label: "Niche trophique", value: tn };
  const ls = txt(row, "Primary.Lifestyle", LIFESTYLE_TRANSLATE);
  if (ls) out.lifestyle = { label: "Mode de vie principal", value: ls };
  return out;
}

async function main(): Promise<void> {
  if (!existsSync(CSV_CACHE)) {
    if (!existsSync(ZIP_CACHE)) {
      console.log(`[avonet] downloading ${URL_AVONET_ZIP}`);
      await download(URL_AVONET_ZIP, ZIP_CACHE);
    }
    console.log("[avonet] extracting CSV");
    writeFileSync(CSV_CACHE, extractCsvFromZip(ZIP_CACHE, CSV_INNER));
  }
  console.log(`[avonet] using ${CSV_CACHE}`);

  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    console.log("[avonet] loading TAXREF bird index...");
    const idx = await client.query<{ cd_nom: number; lb_nom: string }>(
      `SELECT cd_nom, lb_nom FROM taxons WHERE classe = 'Aves' AND lb_nom IS NOT NULL`,
    );
    const nameToCdNom = new Map<string, number>();
    for (const r of idx.rows) nameToCdNom.set(r.lb_nom.trim().toLowerCase(), r.cd_nom);
    console.log(`[avonet] indexed ${nameToCdNom.size} TAXREF bird names`);

    const stream = createReadStream(CSV_CACHE, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let header: string[] = [];
    let parsed = 0, matched = 0, totalTraits = 0;
    await client.query(`DELETE FROM species_traits WHERE source = 'avonet'`);

    let batch: { cdNom: number; traits: Record<string, DbTrait> }[] = [];
    async function flush() {
      if (batch.length === 0) return;
      const values: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const r of batch) {
        values.push(`($${i++}, 'avonet', $${i++}::jsonb)`);
        params.push(r.cdNom, JSON.stringify(r.traits));
      }
      await client.query(
        `INSERT INTO species_traits (cd_nom, source, traits) VALUES ${values.join(",")}
         ON CONFLICT (cd_nom, source) DO UPDATE SET traits = EXCLUDED.traits`,
        params,
      );
      batch = [];
    }

    for await (const rawLine of rl) {
      const line = rawLine.replace(/^\uFEFF/, "");
      if (!line) continue;
      if (header.length === 0) { header = parseCsvLine(line); continue; }
      const fields = parseCsvLine(line);
      const row: Record<string, string> = {};
      header.forEach((h, j) => (row[h] = fields[j] || ""));
      parsed++;
      const binomial = (row["Species1"] || "").trim().toLowerCase();
      if (!binomial) continue;
      const cdNom = nameToCdNom.get(binomial);
      if (!cdNom) continue;
      const traits = buildTraits(row);
      const n = Object.keys(traits).length;
      if (n === 0) continue;
      matched++;
      totalTraits += n;
      batch.push({ cdNom, traits });
      if (batch.length >= 500) await flush();
    }
    await flush();
    console.log(`[avonet] parsed ${parsed} rows, matched ${matched} TAXREF species, inserted ${totalTraits} trait values`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
