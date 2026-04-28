import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export interface BreakdownFilters {
  statutType: string;
  regne?: string;
  classe?: string;
  ordre?: string;
  famille?: string;
  genre?: string;
  groupe2Inpn?: string;
  cdSig?: string;
}

export interface BreakdownRow {
  code: string;
  label: string | null;
  count: number;
}

export interface BreakdownResult {
  totalCount: number;
  breakdown: BreakdownRow[];
}

const TAXO_COLS = [
  ["regne", "regne"],
  ["classe", "classe"],
  ["ordre", "ordre"],
  ["famille", "famille"],
  ["genre", "genre"],
  ["groupe2Inpn", "group2_inpn"],
] as const;

export async function runStatusBreakdown(filters: BreakdownFilters): Promise<BreakdownResult> {
  const conds = [
    sql`t.cd_nom = t.cd_ref`,
    sql`t.rang = 'ES'`,
    sql`s.cd_type_statut = ${filters.statutType}`,
  ];
  for (const [key, col] of TAXO_COLS) {
    const v = filters[key];
    if (v) conds.push(sql`t.${sql.raw(col)} ILIKE ${v}`);
  }
  if (filters.cdSig) conds.push(sql`s.cd_sig = ${filters.cdSig}`);

  const whereSql = sql.join(conds, sql` AND `);
  const rowsRes = await db.execute(sql`
    SELECT s.code_statut AS code, MAX(s.label_statut) AS label, COUNT(DISTINCT t.cd_nom)::int AS count
    FROM taxons t JOIN bdc_statuts s ON s.cd_nom = t.cd_nom
    WHERE ${whereSql}
    GROUP BY s.code_statut
    ORDER BY count DESC
  `);
  const rows = (((rowsRes as unknown) as { rows?: BreakdownRow[] }).rows
    ?? ((rowsRes as unknown) as BreakdownRow[]));
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  return { totalCount, breakdown: rows };
}
