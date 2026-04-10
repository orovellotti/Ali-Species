import { createReadStream } from "fs";
import { createInterface } from "readline";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL required");
}

const pool = new Pool({ connectionString: DATABASE_URL });

const HEADER_MAP: Record<string, number> = {};

function parseRow(line: string): Record<string, string> {
  const fields = line.split("\t");
  const row: Record<string, string> = {};
  for (const [name, idx] of Object.entries(HEADER_MAP)) {
    row[name] = (fields[idx] || "").replace(/^"|"$/g, "");
  }
  return row;
}

async function importData() {
  const client = await pool.connect();

  try {
    await client.query("DELETE FROM taxons");
    console.log("Cleared existing data");

    const dataPath = new URL("../../data/TAXREFv18.txt", import.meta.url).pathname;
    const rl = createInterface({
      input: createReadStream(dataPath, "utf-8"),
      crlfDelay: Infinity,
    });

    let lineNum = 0;
    let batch: string[][] = [];
    let totalInserted = 0;

    for await (const line of rl) {
      lineNum++;

      if (lineNum === 1) {
        const headers = line.split("\t").map((h) => h.replace(/^"|"$/g, ""));
        headers.forEach((h, i) => {
          HEADER_MAP[h] = i;
        });
        console.log("Headers:", Object.keys(HEADER_MAP).join(", "));
        continue;
      }

      const row = parseRow(line);

      const cdNom = parseInt(row.CD_NOM);
      const cdRef = parseInt(row.CD_REF);
      if (isNaN(cdNom) || isNaN(cdRef)) continue;

      const cdSup = parseInt(row.CD_SUP) || null;
      const regne = row.REGNE || null;
      const phylum = row.PHYLUM || null;
      const classe = row.CLASSE || null;
      const ordre = row.ORDRE || null;
      const famille = row.FAMILLE || null;
      const group1 = row.GROUP1_INPN || null;
      const group2 = row.GROUP2_INPN || null;
      const group3 = row.GROUP3_INPN || null;
      const rang = row.RANG || null;
      const lbNom = row.LB_NOM || "";
      const lbAuteur = row.LB_AUTEUR || null;
      const nomComplet = row.NOM_COMPLET || null;
      const nomValide = row.NOM_VALIDE || null;
      const nomVern = row.NOM_VERN || null;
      const nomVernEng = row.NOM_VERN_ENG || null;
      const habitat = row.HABITAT || null;
      const fr = row.FR || null;
      const url = row.URL || null;

      batch.push([
        String(cdNom),
        String(cdRef),
        cdSup !== null ? String(cdSup) : "",
        regne || "",
        phylum || "",
        classe || "",
        ordre || "",
        famille || "",
        group1 || "",
        group2 || "",
        group3 || "",
        rang || "",
        lbNom,
        lbAuteur || "",
        nomComplet || "",
        nomValide || "",
        nomVern || "",
        nomVernEng || "",
        habitat || "",
        fr || "",
        url || "",
      ]);

      if (batch.length >= 1000) {
        await insertBatch(client, batch);
        totalInserted += batch.length;
        batch = [];
        if (totalInserted % 50000 === 0) {
          console.log(`Inserted ${totalInserted} rows...`);
        }
      }
    }

    if (batch.length > 0) {
      await insertBatch(client, batch);
      totalInserted += batch.length;
    }

    console.log(`Total inserted: ${totalInserted} rows`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertBatch(
  client: pg.PoolClient,
  batch: string[][],
) {
  const values: string[] = [];
  const params: (string | null)[] = [];
  let paramIdx = 1;

  for (const row of batch) {
    const placeholders: string[] = [];
    for (const val of row) {
      if (val === "") {
        placeholders.push("NULL");
      } else {
        placeholders.push(`$${paramIdx}`);
        params.push(val);
        paramIdx++;
      }
    }
    values.push(`(${placeholders.join(",")})`);
  }

  const sql = `INSERT INTO taxons (cd_nom, cd_ref, cd_sup, regne, phylum, classe, ordre, famille, group1_inpn, group2_inpn, group3_inpn, rang, lb_nom, lb_auteur, nom_complet, nom_valide, nom_vern, nom_vern_eng, habitat, fr, url) VALUES ${values.join(",")} ON CONFLICT (cd_nom) DO NOTHING`;

  await client.query(sql, params);
}

importData().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
