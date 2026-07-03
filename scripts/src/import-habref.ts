import { execSync } from "child_process";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");

const URL_HABREF = "https://assets.patrinat.fr/files/referentiel/HABREF.zip";
const WORK = join(tmpdir(), "habref-import");
const CSV_DIR = join(WORK, "HABREF_07");
const HAB_CSV = join(CSV_DIR, "HABREF_70.csv");
const CORRESP_CSV = join(CSV_DIR, "HABREF_CORRESP_TAXON_70.csv");

// CD_TYPO of the EUNIS habitat classification inside HABREF (confirmed: root
// codes are the EUNIS letters A..J). We only surface EUNIS habitats, which
// align with the existing scraped-EUNIS feature and carry French labels.
const EUNIS_TYPO = "7";

/** RFC4180-style parser (delimiter `;`) that handles quoted multi-line fields. */
function parseCsv(content: string, delim = ";"): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore CR
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function download(): void {
  if (existsSync(HAB_CSV) && existsSync(CORRESP_CSV)) {
    console.log(`[habref] using cached CSVs in ${CSV_DIR}`);
    return;
  }
  mkdirSync(WORK, { recursive: true });
  const zip = join(WORK, "HABREF.zip");
  console.log(`[habref] downloading ${URL_HABREF}`);
  execSync(`curl -sSL -o "${zip}" "${URL_HABREF}"`, { stdio: "inherit" });
  console.log("[habref] extracting (nested zip)...");
  execSync(`unzip -o -q "${zip}" -d "${WORK}"`, { stdio: "inherit" });
  execSync(`unzip -o -q "${join(WORK, "HABREF_07.zip")}" -d "${WORK}"`, {
    stdio: "inherit",
  });
}

interface HabRef {
  code: string;
  label: string;
}

async function main(): Promise<void> {
  download();

  // 1) EUNIS habitat reference: CD_HAB -> { code, label }
  console.log("[habref] parsing habitat reference...");
  const habRows = parseCsv(readFileSync(HAB_CSV, "utf8"));
  const habHeader = habRows[0].map((h, i) => (i === 0 ? stripBom(h) : h));
  const H = (name: string): number => {
    const idx = habHeader.indexOf(name);
    if (idx < 0) throw new Error(`HABREF_70.csv missing column "${name}"`);
    return idx;
  };
  const iCdHab = H("CD_HAB");
  const iTypo = H("CD_TYPO");
  const iCode = H("LB_CODE");
  const iFr = H("LB_HAB_FR");
  const eunisHab = new Map<string, HabRef>();
  for (let r = 1; r < habRows.length; r++) {
    const row = habRows[r];
    if (row[iTypo] !== EUNIS_TYPO) continue;
    const code = (row[iCode] || "").trim();
    const label = (row[iFr] || "").trim();
    if (!code || !label) continue;
    eunisHab.set(row[iCdHab], { code, label });
  }
  console.log(`[habref] ${eunisHab.size} EUNIS habitats with French labels`);

  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    // 2) cd_nom -> cd_ref map from TAXREF
    console.log("[habref] loading cd_nom -> cd_ref map...");
    const idx = await client.query<{ cd_nom: number; cd_ref: number }>(
      `SELECT cd_nom, cd_ref FROM taxons WHERE cd_ref IS NOT NULL`,
    );
    const cdNomToRef = new Map<number, number>();
    for (const r of idx.rows) cdNomToRef.set(r.cd_nom, r.cd_ref);
    console.log(`[habref] indexed ${cdNomToRef.size} TAXREF taxa`);

    // 3) Aggregate correspondences per cd_ref (dedup by habitat code)
    console.log("[habref] parsing species correspondences...");
    const corrRows = parseCsv(readFileSync(CORRESP_CSV, "utf8"));
    const corrHeader = corrRows[0].map((h, i) => (i === 0 ? stripBom(h) : h));
    const C = (name: string): number => {
      const idx = corrHeader.indexOf(name);
      if (idx < 0) throw new Error(`HABREF_CORRESP_TAXON_70.csv missing column "${name}"`);
      return idx;
    };
    const iHabEntre = C("CD_HAB_ENTRE");
    const iCdNom = C("CD_NOM");
    const iValid = C("VALIDITE");

    const perRef = new Map<number, Map<string, HabRef>>();
    let matched = 0;
    for (let r = 1; r < corrRows.length; r++) {
      const row = corrRows[r];
      if ((row[iValid] || "").toLowerCase() !== "true") continue;
      const hab = eunisHab.get(row[iHabEntre]);
      if (!hab) continue;
      const cdNom = Number(row[iCdNom]);
      if (!Number.isFinite(cdNom)) continue;
      const cdRef = cdNomToRef.get(cdNom);
      if (!cdRef) continue;
      let set = perRef.get(cdRef);
      if (!set) {
        set = new Map<string, HabRef>();
        perRef.set(cdRef, set);
      }
      if (!set.has(hab.code)) set.set(hab.code, hab);
      matched++;
    }
    console.log(
      `[habref] matched ${matched} correspondences over ${perRef.size} accepted taxa`,
    );

    // 4) Replace atomically: an aborted run must not leave the table empty.
    if (perRef.size === 0) {
      throw new Error("[habref] refusing to wipe table: 0 rows parsed");
    }
    await client.query("BEGIN");
    try {
      await client.query(`DELETE FROM habref_habitats`);
      const BATCH = 500;
      const entries = [...perRef.entries()];
      for (let start = 0; start < entries.length; start += BATCH) {
        const slice = entries.slice(start, start + BATCH);
        const values: string[] = [];
        const params: unknown[] = [];
        let i = 1;
        for (const [cdRef, set] of slice) {
          const habitats = [...set.values()].sort((a, b) =>
            a.code.localeCompare(b.code),
          );
          values.push(`($${i++}, $${i++}::jsonb)`);
          params.push(cdRef, JSON.stringify(habitats));
        }
        await client.query(
          `INSERT INTO habref_habitats (cd_ref, habitats) VALUES ${values.join(",")}
           ON CONFLICT (cd_ref) DO UPDATE SET habitats = EXCLUDED.habitats, updated_at = now()`,
          params,
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log(`[habref] upserted ${perRef.size} rows`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
