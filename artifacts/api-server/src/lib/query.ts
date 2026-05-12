import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { resolveStatutCode } from "./statutCodeAlias.js";

export interface Filters {
  name?: string;
  regne?: string;
  phylum?: string;
  classe?: string;
  ordre?: string;
  famille?: string;
  genre?: string;
  rang?: string;
  statutType?: string;
  statutCode?: string;
  cdSig?: string;
  groupe2Inpn?: string;
  habitat?: string;
  limit?: number;
}

export interface SpeciesItem {
  cdNom: number;
  lbNom: string;
  nomVern: string | null;
  rang: string;
  regne: string | null;
  classe: string | null;
  ordre: string | null;
  famille: string | null;
}

interface TaxonRow {
  cd_nom: number;
  lb_nom: string;
  nom_vern: string | null;
  rang: string;
  regne: string | null;
  classe: string | null;
  ordre: string | null;
  famille: string | null;
}

interface DbExecuteResult<T> {
  rows?: T[];
}

function rowsOf<T>(res: unknown): T[] {
  const r = res as DbExecuteResult<T> | T[];
  if (Array.isArray(r)) return r;
  return r.rows ?? [];
}

function mapTaxonRow(r: TaxonRow): SpeciesItem {
  return {
    cdNom: r.cd_nom,
    lbNom: r.lb_nom,
    nomVern: r.nom_vern,
    rang: r.rang,
    regne: r.regne,
    classe: r.classe,
    ordre: r.ordre,
    famille: r.famille,
  };
}

export async function runQuery(
  filters: Filters,
): Promise<{ totalCount: number; items: SpeciesItem[] }> {
  const conds: SQL[] = [sql`t.cd_nom = t.cd_ref`];

  const rang = filters.rang ?? "ES";
  if (rang) conds.push(sql`t.rang = ${rang}`);

  if (filters.name) {
    const raw = filters.name.trim();
    // For single-word queries (typical taxonomic names like "Ophrys"), match on
    // word boundaries to avoid catching unrelated substrings (e.g. "Ophrys"
    // inside "Callophrys"). For multi-word queries, fall back to plain ILIKE
    // substring (vernacular names are often multi-word).
    if (/^[\p{L}\-]+$/u.test(raw)) {
      const escaped = raw.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      conds.push(sql`(t.lb_nom ~* ${'\\m' + escaped + '\\M'} OR t.nom_vern ~* ${'\\m' + escaped + '\\M'})`);
    } else {
      const pat = `%${raw}%`;
      conds.push(sql`(t.lb_nom ILIKE ${pat} OR t.nom_vern ILIKE ${pat})`);
    }
  }
  // The taxons table has no `genre` column — derive it from lb_nom prefix.
  if (typeof filters.genre === "string" && filters.genre.length > 0) {
    const g = filters.genre.trim().replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    conds.push(sql`t.lb_nom ~* ${'^' + g + '\\M'}`);
  }
  const filterCols: ReadonlyArray<readonly [keyof Filters, string]> = [
    ["regne", "regne"], ["phylum", "phylum"], ["classe", "classe"],
    ["ordre", "ordre"], ["famille", "famille"],
    ["groupe2Inpn", "group2_inpn"], ["habitat", "habitat"],
  ];
  for (const [k, col] of filterCols) {
    const v = filters[k];
    if (typeof v === "string" && v.length > 0) {
      conds.push(sql`t.${sql.raw(col)} ILIKE ${v}`);
    }
  }

  if (filters.statutType || filters.statutCode || filters.cdSig) {
    const subConds: SQL[] = [sql`s.cd_nom = t.cd_nom`];
    if (filters.statutType) subConds.push(sql`s.cd_type_statut = ${filters.statutType}`);
    if (filters.statutCode) {
      const resolved = resolveStatutCode(filters.statutType, filters.statutCode) ?? filters.statutCode;
      subConds.push(sql`s.code_statut = ${resolved}`);
    }
    if (filters.cdSig) subConds.push(sql`s.cd_sig = ${filters.cdSig}`);
    conds.push(sql`EXISTS (SELECT 1 FROM bdc_statuts s WHERE ${sql.join(subConds, sql` AND `)})`);
  }

  const whereSql = sql.join(conds, sql` AND `);
  const limit = Math.min(Math.max(filters.limit ?? 12, 1), 30);

  const countRow = await db.execute(sql`SELECT COUNT(*)::int AS c FROM taxons t WHERE ${whereSql}`);
  const totalCount = rowsOf<{ c: number }>(countRow)[0]?.c ?? 0;

  const rowsResult = await db.execute(sql`
    SELECT t.cd_nom, t.lb_nom, t.nom_vern, t.rang, t.regne, t.classe, t.ordre, t.famille
    FROM taxons t
    WHERE ${whereSql}
    ORDER BY t.lb_nom
    LIMIT ${limit}
  `);
  const items = rowsOf<TaxonRow>(rowsResult).map(mapTaxonRow);

  return { totalCount, items };
}
