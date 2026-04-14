import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import path from "path";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const HEADER_MAP: Record<string, number> = {};

function parseRow(line: string): Record<string, string> {
  const fields = line.split("\t");
  const row: Record<string, string> = {};
  for (const [name, idx] of Object.entries(HEADER_MAP)) {
    row[name] = (fields[idx] || "").replace(/^"|"$/g, "");
  }
  return row;
}

async function insertBatch(client: any, batch: string[][]) {
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

const EXPECTED_COUNT = 708685;
const BDC_EXPECTED_COUNT = 447664;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

export async function seedIfEmpty() {
  try {
    const countResult = await pool.query("SELECT COUNT(*)::int as count FROM taxons");
    const count = countResult.rows[0].count;

    if (count >= EXPECTED_COUNT) {
      logger.info({ count }, "Database has all data, skipping seed");
      await seedBdcStatuts();
      return;
    }

    if (count > 0) {
      logger.info({ count, expected: EXPECTED_COUNT }, "Database has partial data, resuming import...");
    } else {
      logger.info("Database is empty, starting TAXREF import...");
    }

    const possiblePaths = [
      path.resolve(process.cwd(), "data/TAXREFv18.txt"),
      path.resolve(process.cwd(), "../data/TAXREFv18.txt"),
      path.resolve(process.cwd(), "../../data/TAXREFv18.txt"),
      "/home/runner/workspace/data/TAXREFv18.txt",
    ];

    let dataPath: string | null = null;
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        dataPath = p;
        break;
      }
    }

    if (!dataPath) {
      logger.warn("TAXREF data file not found, skipping seed");
      return;
    }

    logger.info({ dataPath }, "Found TAXREF data file");

    const client = await pool.connect();

    try {
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
          continue;
        }

        const row = parseRow(line);
        const cdNom = parseInt(row.CD_NOM);
        const cdRef = parseInt(row.CD_REF);
        if (isNaN(cdNom) || isNaN(cdRef)) continue;

        batch.push([
          String(cdNom),
          String(cdRef),
          parseInt(row.CD_SUP) ? String(parseInt(row.CD_SUP)) : "",
          row.REGNE || "",
          row.PHYLUM || "",
          row.CLASSE || "",
          row.ORDRE || "",
          row.FAMILLE || "",
          row.GROUP1_INPN || "",
          row.GROUP2_INPN || "",
          row.GROUP3_INPN || "",
          row.RANG || "",
          row.LB_NOM || "",
          row.LB_AUTEUR || "",
          row.NOM_COMPLET || "",
          row.NOM_VALIDE || "",
          row.NOM_VERN || "",
          row.NOM_VERN_ENG || "",
          row.HABITAT || "",
          row.FR || "",
          row.URL || "",
        ]);

        if (batch.length >= 2000) {
          await insertBatch(client, batch);
          totalInserted += batch.length;
          batch = [];
          if (totalInserted % 100000 === 0) {
            logger.info({ totalInserted }, "Import progress");
          }
        }
      }

      if (batch.length > 0) {
        await insertBatch(client, batch);
        totalInserted += batch.length;
      }

      logger.info({ totalInserted }, "TAXREF import complete");
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "Seed failed");
  }

  await seedBdcStatuts();
}

const BDC_HEADER_MAP: Record<string, number> = {};

async function insertBdcBatch(client: any, batch: string[][]) {
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

  const sql = `INSERT INTO bdc_statuts (cd_nom, cd_ref, cd_type_statut, lb_type_statut, regroupement_type, code_statut, label_statut, rq_statut, cd_sig, lb_adm_tr, niveau_admin, full_citation, doc_url) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`;
  await client.query(sql, params);
}

async function seedBdcStatuts() {
  try {
    const countResult = await pool.query("SELECT COUNT(*)::int as count FROM bdc_statuts");
    const count = countResult.rows[0].count;

    if (count >= BDC_EXPECTED_COUNT) {
      logger.info({ count }, "BDC statuts table has all data, skipping seed");
      return;
    }

    if (count > 0) {
      logger.info({ count, expected: BDC_EXPECTED_COUNT }, "BDC statuts table has partial data, clearing and reimporting...");
      await pool.query("TRUNCATE bdc_statuts RESTART IDENTITY");
    } else {
      logger.info("BDC statuts table is empty, starting import...");
    }

    const possiblePaths = [
      path.resolve(process.cwd(), "data/bdc_18_01.csv"),
      path.resolve(process.cwd(), "../data/bdc_18_01.csv"),
      path.resolve(process.cwd(), "../../data/bdc_18_01.csv"),
      "/home/runner/workspace/data/bdc_18_01.csv",
    ];

    let dataPath: string | null = null;
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        dataPath = p;
        break;
      }
    }

    if (!dataPath) {
      logger.warn("BDC data file not found, skipping seed");
      return;
    }

    logger.info({ dataPath }, "Found BDC data file");

    const client = await pool.connect();

    try {
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
          const headers = parseCsvLine(line);
          headers.forEach((h, i) => {
            BDC_HEADER_MAP[h] = i;
          });
          continue;
        }

        const fields = parseCsvLine(line);
        const get = (name: string) => fields[BDC_HEADER_MAP[name]] || "";

        const cdNom = parseInt(get("CD_NOM"));
        const cdRef = parseInt(get("CD_REF"));
        if (isNaN(cdNom) || isNaN(cdRef)) continue;

        batch.push([
          String(cdNom),
          String(cdRef),
          get("CD_TYPE_STATUT"),
          get("LB_TYPE_STATUT"),
          get("REGROUPEMENT_TYPE"),
          get("CODE_STATUT"),
          get("LABEL_STATUT"),
          get("RQ_STATUT"),
          get("CD_SIG"),
          get("LB_ADM_TR"),
          get("NIVEAU_ADMIN"),
          get("FULL_CITATION"),
          get("DOC_URL"),
        ]);

        if (batch.length >= 2000) {
          await insertBdcBatch(client, batch);
          totalInserted += batch.length;
          batch = [];
          if (totalInserted % 100000 === 0) {
            logger.info({ totalInserted }, "BDC import progress");
          }
        }
      }

      if (batch.length > 0) {
        await insertBdcBatch(client, batch);
        totalInserted += batch.length;
      }

      logger.info({ totalInserted }, "BDC statuts import complete");
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "BDC seed failed");
  }
}
