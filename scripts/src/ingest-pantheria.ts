import { createWriteStream, existsSync, createReadStream } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createInterface } from "readline";
import https from "https";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");

const URL_PANTHERIA =
  "https://esapubs.org/archive/ecol/E090/184/PanTHERIA_1-0_WR05_Aug2008.txt";
const CACHE = join(tmpdir(), "PanTHERIA_1-0_WR05_Aug2008.txt");

async function download(url: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
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

interface FieldSpec {
  col: string;
  key: string;
  label: string;
  unit?: string;
  transform?: (v: number) => number;
  outUnit?: string;
  enumMap?: Record<number, string>;
}

const FIELDS: FieldSpec[] = [
  { col: "5-1_AdultBodyMass_g", key: "adultBodyMass", label: "Masse adulte", unit: "g" },
  { col: "13-1_AdultHeadBodyLen_mm", key: "adultHeadBodyLen", label: "Longueur tête-corps", unit: "mm" },
  { col: "8-1_AdultForearmLen_mm", key: "adultForearmLen", label: "Longueur avant-bras", unit: "mm" },
  { col: "9-1_GestationLen_d", key: "gestationLen", label: "Gestation", unit: "j" },
  { col: "17-1_MaxLongevity_m", key: "maxLongevity", label: "Longévité maximale", unit: "mois" },
  { col: "15-1_LitterSize", key: "litterSize", label: "Taille de portée" },
  { col: "16-1_LittersPerYear", key: "littersPerYear", label: "Portées par an" },
  { col: "14-1_InterbirthInterval_d", key: "interbirthInterval", label: "Intervalle entre naissances", unit: "j" },
  { col: "25-1_WeaningAge_d", key: "weaningAge", label: "Âge au sevrage", unit: "j" },
  { col: "23-1_SexualMaturityAge_d", key: "sexualMaturityAge", label: "Maturité sexuelle", unit: "j" },
  { col: "5-3_NeonateBodyMass_g", key: "neonateBodyMass", label: "Masse à la naissance", unit: "g" },
  { col: "5-4_WeaningBodyMass_g", key: "weaningBodyMass", label: "Masse au sevrage", unit: "g" },
  { col: "22-1_HomeRange_km2", key: "homeRange", label: "Domaine vital", unit: "km²" },
  { col: "21-1_PopulationDensity_n/km2", key: "populationDensity", label: "Densité de population", unit: "ind/km²" },
  { col: "10-2_SocialGrpSize", key: "socialGrpSize", label: "Taille du groupe social" },
  { col: "24-1_TeatNumber", key: "teatNumber", label: "Nombre de mamelles" },
  {
    col: "1-1_ActivityCycle",
    key: "activityCycle",
    label: "Cycle d'activité",
    enumMap: { 1: "Nocturne", 2: "Mixte (cathéméral)", 3: "Diurne" },
  },
  {
    col: "6-2_TrophicLevel",
    key: "trophicLevel",
    label: "Régime alimentaire",
    enumMap: { 1: "Herbivore", 2: "Omnivore", 3: "Carnivore" },
  },
  {
    col: "12-2_Terrestriality",
    key: "terrestriality",
    label: "Mode de vie",
    enumMap: { 1: "Fossorial / terrestre", 2: "Arboricole / aérien" },
  },
  { col: "6-1_DietBreadth", key: "dietBreadth", label: "Diversité alimentaire (catégories)" },
  { col: "12-1_HabitatBreadth", key: "habitatBreadth", label: "Diversité d'habitats" },
];

function fmtNumber(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  if (abs >= 10) return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  if (abs >= 1) return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

interface TraitField {
  label: string;
  value: string;
  unit?: string;
  raw?: number | string;
}

function buildTraits(row: Record<string, string>): Record<string, TraitField> {
  const out: Record<string, TraitField> = {};
  for (const f of FIELDS) {
    const raw = row[f.col];
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n === -999 || n <= -998) continue;
    if (f.enumMap) {
      const key = Math.round(n);
      const label = f.enumMap[key];
      if (label) out[f.key] = { label: f.label, value: label, raw: key };
      continue;
    }
    out[f.key] = {
      label: f.label,
      value: fmtNumber(n),
      unit: f.unit,
      raw: n,
    };
  }
  return out;
}

async function main(): Promise<void> {
  if (!existsSync(CACHE)) {
    console.log(`[pantheria] downloading ${URL_PANTHERIA}`);
    await download(URL_PANTHERIA, CACHE);
  } else {
    console.log(`[pantheria] using cached ${CACHE}`);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    // Load TAXREF lbNom -> cdNom map for mammals (Mammalia)
    console.log("[pantheria] loading TAXREF mammals index...");
    const idx = await client.query<{ cd_nom: number; lb_nom: string }>(
      `SELECT cd_nom, lb_nom FROM taxons WHERE classe = 'Mammalia' AND lb_nom IS NOT NULL`,
    );
    const nameToCdNom = new Map<string, number>();
    for (const r of idx.rows) {
      nameToCdNom.set(r.lb_nom.trim().toLowerCase(), r.cd_nom);
    }
    console.log(`[pantheria] indexed ${nameToCdNom.size} TAXREF mammal names`);

    // Parse PanTHERIA TSV
    const stream = createReadStream(CACHE, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let header: string[] = [];
    const headerIdx: Record<string, number> = {};
    let parsed = 0;
    let matched = 0;
    let totalTraits = 0;

    await client.query(`DELETE FROM species_traits WHERE source = 'pantheria'`);

    const BATCH = 500;
    let batch: { cdNom: number; traits: Record<string, TraitField> }[] = [];

    async function flush() {
      if (batch.length === 0) return;
      const values: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const r of batch) {
        values.push(`($${i++}, 'pantheria', $${i++}::jsonb)`);
        params.push(r.cdNom, JSON.stringify(r.traits));
      }
      await client.query(
        `INSERT INTO species_traits (cd_nom, source, traits) VALUES ${values.join(",")}
         ON CONFLICT (cd_nom, source) DO UPDATE SET traits = EXCLUDED.traits`,
        params,
      );
      batch = [];
    }

    for await (const line of rl) {
      if (!line) continue;
      if (header.length === 0) {
        header = line.split("\t");
        header.forEach((h, j) => (headerIdx[h] = j));
        continue;
      }
      const fields = line.split("\t");
      const row: Record<string, string> = {};
      for (const [name, j] of Object.entries(headerIdx)) row[name] = fields[j] || "";
      parsed++;

      const binomial = (row["MSW05_Binomial"] || "").trim().toLowerCase();
      if (!binomial) continue;
      const cdNom = nameToCdNom.get(binomial);
      if (!cdNom) continue;

      const traits = buildTraits(row);
      const traitCount = Object.keys(traits).length;
      if (traitCount === 0) continue;

      matched++;
      totalTraits += traitCount;
      batch.push({ cdNom, traits });
      if (batch.length >= BATCH) await flush();
    }
    await flush();

    console.log(
      `[pantheria] parsed ${parsed} rows, matched ${matched} TAXREF species, inserted ${totalTraits} trait values`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
