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

const URL_AMPHIBIO_ZIP = "https://ndownloader.figshare.com/files/8828578";
const ZIP_CACHE = join(tmpdir(), "amphibio.zip");
const CSV_CACHE = join(tmpdir(), "AmphiBIO_v1.csv");

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

function extractCsvFromZip(zipPath: string, csvName: string): Buffer {
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
    const localOff = buf.readUInt32LE(o + 42);
    const name = buf.slice(o + 46, o + 46 + fnLen).toString();
    if (name === csvName) {
      const lh = localOff;
      const lFnLen = buf.readUInt16LE(lh + 26);
      const lXLen = buf.readUInt16LE(lh + 28);
      const cmp = buf.readUInt16LE(lh + 8);
      const cSz = buf.readUInt32LE(lh + 18);
      const dataOff = lh + 30 + lFnLen + lXLen;
      const data = buf.slice(dataOff, dataOff + cSz);
      return cmp === 8 ? inflateRawSync(data) : data;
    }
    o += 46 + fnLen + xLen + cLen;
  }
  throw new Error(`File ${csvName} not in ZIP`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
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
  { col: "Body_mass_g", key: "bodyMass", label: "Masse corporelle", unit: "g" },
  { col: "Body_size_mm", key: "bodySize", label: "Taille corporelle", unit: "mm" },
  { col: "Longevity_max_y", key: "longevity", label: "Longévité maximale", unit: "ans" },
  { col: "Age_at_maturity_min_y", key: "matAgeMin", label: "Maturité (min)", unit: "ans" },
  { col: "Age_at_maturity_max_y", key: "matAgeMax", label: "Maturité (max)", unit: "ans" },
  { col: "Size_at_maturity_min_mm", key: "matSizeMin", label: "Taille à maturité (min)", unit: "mm" },
  { col: "Size_at_maturity_max_mm", key: "matSizeMax", label: "Taille à maturité (max)", unit: "mm" },
  { col: "Litter_size_min_n", key: "litterMin", label: "Taille de ponte (min)" },
  { col: "Litter_size_max_n", key: "litterMax", label: "Taille de ponte (max)" },
  { col: "Reproductive_output_y", key: "reproOutput", label: "Pontes par an" },
  { col: "Offspring_size_min_mm", key: "offMin", label: "Taille des juvéniles (min)", unit: "mm" },
  { col: "Offspring_size_max_mm", key: "offMax", label: "Taille des juvéniles (max)", unit: "mm" },
];

const HABITAT_FLAGS: Record<string, string> = {
  Fos: "Fouisseur",
  Ter: "Terrestre",
  Aqu: "Aquatique",
  Arb: "Arboricole",
};
const DIET_FLAGS: Record<string, string> = {
  Leaves: "Feuilles",
  Flowers: "Fleurs",
  Seeds: "Graines",
  Fruits: "Fruits",
  Arthro: "Arthropodes",
  Vert: "Vertébrés",
};
const ACTIVITY_FLAGS: Record<string, string> = {
  Diu: "Diurne",
  Noc: "Nocturne",
  Crepu: "Crépusculaire",
};
const REPRO_FLAGS: Record<string, string> = {
  Dir: "Développement direct",
  Lar: "Larvaire",
  Viv: "Vivipare",
};

function joinFlags(row: Record<string, string>, flags: Record<string, string>): string | null {
  const out: string[] = [];
  for (const [col, label] of Object.entries(flags)) {
    if (row[col] === "1") out.push(label);
  }
  return out.length > 0 ? out.join(", ") : null;
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
  const habitat = joinFlags(row, HABITAT_FLAGS);
  if (habitat) out.habitat = { label: "Habitat", value: habitat };
  const diet = joinFlags(row, DIET_FLAGS);
  if (diet) out.diet = { label: "Régime alimentaire", value: diet };
  const activity = joinFlags(row, ACTIVITY_FLAGS);
  if (activity) out.activity = { label: "Cycle d'activité", value: activity };
  const repro = joinFlags(row, REPRO_FLAGS);
  if (repro) out.reproMode = { label: "Mode de reproduction", value: repro };
  return out;
}

async function main(): Promise<void> {
  if (!existsSync(CSV_CACHE)) {
    if (!existsSync(ZIP_CACHE)) {
      console.log(`[amphibio] downloading ${URL_AMPHIBIO_ZIP}`);
      await download(URL_AMPHIBIO_ZIP, ZIP_CACHE);
    }
    console.log("[amphibio] extracting CSV from ZIP");
    const csv = extractCsvFromZip(ZIP_CACHE, "AmphiBIO_v1.csv");
    writeFileSync(CSV_CACHE, csv);
  }
  console.log(`[amphibio] using ${CSV_CACHE}`);

  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    console.log("[amphibio] loading TAXREF amphibian index...");
    const idx = await client.query<{ cd_nom: number; lb_nom: string }>(
      `SELECT cd_nom, lb_nom FROM taxons WHERE classe = 'Amphibia' AND lb_nom IS NOT NULL`,
    );
    const nameToCdNom = new Map<string, number>();
    for (const r of idx.rows) nameToCdNom.set(r.lb_nom.trim().toLowerCase(), r.cd_nom);
    console.log(`[amphibio] indexed ${nameToCdNom.size} TAXREF amphibian names`);

    const stream = createReadStream(CSV_CACHE, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let header: string[] = [];
    let parsed = 0, matched = 0, totalTraits = 0;
    await client.query(`DELETE FROM species_traits WHERE source = 'amphibio'`);

    let batch: { cdNom: number; traits: Record<string, DbTrait> }[] = [];
    async function flush() {
      if (batch.length === 0) return;
      const values: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const r of batch) {
        values.push(`($${i++}, 'amphibio', $${i++}::jsonb)`);
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
      const binomial = (row["Species"] || "").trim().toLowerCase();
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
    console.log(`[amphibio] parsed ${parsed} rows, matched ${matched} TAXREF species, inserted ${totalTraits} trait values`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
