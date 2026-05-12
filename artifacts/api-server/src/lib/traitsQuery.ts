import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";

export type TraitSource = "pantheria" | "avonet" | "amphibio";

export const TRAIT_SOURCES: ReadonlyArray<TraitSource> = ["pantheria", "avonet", "amphibio"];

export const TRAIT_KEYS: Record<TraitSource, ReadonlyArray<string>> = {
  pantheria: [
    "adultBodyMass", "adultHeadBodyLen", "adultForearmLen", "neonateBodyMass",
    "weaningBodyMass", "litterSize", "littersPerYear", "gestationLen",
    "weaningAge", "sexualMaturityAge", "interbirthInterval", "maxLongevity",
    "teatNumber", "homeRange", "populationDensity", "socialGrpSize",
    "trophicLevel", "dietBreadth", "habitatBreadth", "terrestriality",
    "activityCycle",
  ],
  avonet: [
    "mass", "wingLen", "tailLen", "tarsusLen", "secondary1", "kippsDist",
    "handWingIdx", "beakLenCulmen", "beakLenNares", "beakWidth", "beakDepth",
    "rangeSize", "trophicLevel", "trophicNiche", "lifestyle", "habitat",
    "migration",
  ],
  amphibio: [
    "bodyMass", "bodySize", "matSizeMin", "matSizeMax", "matAgeMin", "matAgeMax",
    "longevity", "litterMin", "litterMax", "offMin", "offMax", "reproOutput",
    "habitat", "diet", "activity", "reproMode",
  ],
};

export interface TraitFilters {
  source: TraitSource;
  traitKey?: string;
  minValue?: number;
  maxValue?: number;
  valueContains?: string;
  sortBy?: "value_asc" | "value_desc" | "name";
  regne?: string;
  classe?: string;
  ordre?: string;
  famille?: string;
  groupe2Inpn?: string;
  statutType?: string;
  statutCode?: string;
  cdSig?: string;
  limit?: number;
}

export interface TraitQueryItem {
  cdNom: number;
  lbNom: string;
  nomVern: string | null;
  classe: string | null;
  famille: string | null;
  traitLabel: string | null;
  traitValue: string | null;
  traitUnit: string | null;
  traitRaw: number | string | null;
}

interface DbExecuteResult<T> { rows?: T[] }
function rowsOf<T>(res: unknown): T[] {
  const r = res as DbExecuteResult<T> | T[];
  if (Array.isArray(r)) return r;
  return r.rows ?? [];
}

interface TraitRow {
  cd_nom: number;
  lb_nom: string;
  nom_vern: string | null;
  classe: string | null;
  famille: string | null;
  trait_label: string | null;
  trait_value: string | null;
  trait_unit: string | null;
  trait_raw_num: number | null;
  trait_raw_text: string | null;
}

export async function runTraitQuery(
  filters: TraitFilters,
): Promise<{ totalCount: number; items: TraitQueryItem[]; sourceUsed: TraitSource; traitKeyUsed: string | null }> {
  const source = filters.source;
  if (!TRAIT_SOURCES.includes(source)) {
    throw new Error(`source invalide: ${source}`);
  }

  const traitKey = filters.traitKey && TRAIT_KEYS[source].includes(filters.traitKey)
    ? filters.traitKey
    : null;

  const conds: SQL[] = [
    sql`t.cd_nom = t.cd_ref`,
    sql`t.rang = 'ES'`,
    sql`st.source = ${source}`,
  ];

  const filterCols: ReadonlyArray<readonly [keyof TraitFilters, string]> = [
    ["regne", "regne"], ["classe", "classe"], ["ordre", "ordre"],
    ["famille", "famille"], ["groupe2Inpn", "group2_inpn"],
  ];
  for (const [k, col] of filterCols) {
    const v = filters[k];
    if (typeof v === "string" && v.length > 0) {
      conds.push(sql`t.${sql.raw(col)} ILIKE ${v}`);
    }
  }

  if (filters.statutType || filters.statutCode || filters.cdSig) {
    const subConds: SQL[] = [sql`bs.cd_nom = t.cd_nom`];
    if (filters.statutType) subConds.push(sql`bs.cd_type_statut = ${filters.statutType}`);
    if (filters.statutCode) subConds.push(sql`bs.code_statut = ${filters.statutCode}`);
    if (filters.cdSig) subConds.push(sql`bs.cd_sig = ${filters.cdSig}`);
    conds.push(sql`EXISTS (SELECT 1 FROM bdc_statuts bs WHERE ${sql.join(subConds, sql` AND `)})`);
  }

  // Cast SQL sûr: ne tente la conversion en float que si la chaîne (après nettoyage) ressemble à un nombre.
  // Évite les "invalid input syntax for type double precision" si la donnée 'raw' contient du texte parasite.
  const rawNumericExpr = (key: string): SQL => sql`
    CASE
      WHEN NULLIF(regexp_replace(st.traits->${key}->>'raw', '[^0-9.\\-]', '', 'g'), '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN NULLIF(regexp_replace(st.traits->${key}->>'raw', '[^0-9.\\-]', '', 'g'), '')::float
      ELSE NULL
    END
  `;

  if (traitKey) {
    conds.push(sql`st.traits ? ${traitKey}`);
    if (filters.minValue !== undefined) {
      conds.push(sql`${rawNumericExpr(traitKey)} >= ${filters.minValue}`);
    }
    if (filters.maxValue !== undefined) {
      conds.push(sql`${rawNumericExpr(traitKey)} <= ${filters.maxValue}`);
    }
    if (filters.valueContains && filters.valueContains.length > 0) {
      const pat = `%${filters.valueContains}%`;
      conds.push(sql`(st.traits->${traitKey}->>'value') ILIKE ${pat}`);
    }
  } else if (filters.valueContains && filters.valueContains.length > 0) {
    // Filet de sécurité : si le LLM oublie traitKey mais fournit valueContains,
    // on cherche la sous-chaîne dans n'importe quelle valeur textuelle du jsonb.
    // Le filtre source= a déjà restreint le scope, ça reste rapide.
    const pat = `%${filters.valueContains}%`;
    conds.push(sql`EXISTS (
      SELECT 1 FROM jsonb_each(st.traits) AS kv(k, v)
      WHERE (v->>'value') ILIKE ${pat}
    )`);
  }

  const whereSql = sql.join(conds, sql` AND `);
  const rawLimit = typeof filters.limit === "number" && Number.isFinite(filters.limit)
    ? Math.floor(filters.limit)
    : 12;
  const limit = Math.min(Math.max(rawLimit, 1), 30);

  const countRow = await db.execute(sql`
    SELECT COUNT(*)::int AS c
    FROM species_traits st
    JOIN taxons t ON t.cd_nom = st.cd_nom
    WHERE ${whereSql}
  `);
  const totalCount = rowsOf<{ c: number }>(countRow)[0]?.c ?? 0;

  let orderSql: SQL;
  if (traitKey && (filters.sortBy === "value_desc")) {
    orderSql = sql`${rawNumericExpr(traitKey)} DESC NULLS LAST, t.lb_nom ASC`;
  } else if (traitKey && (filters.sortBy === "value_asc")) {
    orderSql = sql`${rawNumericExpr(traitKey)} ASC NULLS LAST, t.lb_nom ASC`;
  } else {
    orderSql = sql`t.lb_nom ASC`;
  }

  const traitSelectKey = traitKey ?? "";
  const rowsResult = await db.execute(sql`
    SELECT
      t.cd_nom, t.lb_nom, t.nom_vern, t.classe, t.famille,
      ${traitKey ? sql`st.traits->${traitSelectKey}->>'label' AS trait_label,
                       st.traits->${traitSelectKey}->>'value' AS trait_value,
                       st.traits->${traitSelectKey}->>'unit'  AS trait_unit,
                       NULLIF(regexp_replace(st.traits->${traitSelectKey}->>'raw', '[^0-9.\\-]', '', 'g'), '')::float AS trait_raw_num,
                       st.traits->${traitSelectKey}->>'raw'   AS trait_raw_text`
        : sql`NULL::text AS trait_label, NULL::text AS trait_value, NULL::text AS trait_unit, NULL::float AS trait_raw_num, NULL::text AS trait_raw_text`}
    FROM species_traits st
    JOIN taxons t ON t.cd_nom = st.cd_nom
    WHERE ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ${limit}
  `);

  const items = rowsOf<TraitRow>(rowsResult).map((r) => ({
    cdNom: r.cd_nom,
    lbNom: r.lb_nom,
    nomVern: r.nom_vern,
    classe: r.classe,
    famille: r.famille,
    traitLabel: r.trait_label,
    traitValue: r.trait_value,
    traitUnit: r.trait_unit,
    traitRaw: r.trait_raw_num ?? r.trait_raw_text,
  }));

  return { totalCount, items, sourceUsed: source, traitKeyUsed: traitKey };
}

export interface TraitFieldOut {
  key: string;
  label: string;
  value: string;
  unit?: string;
}

export interface TraitsBySourceOut {
  source: TraitSource;
  fields: TraitFieldOut[];
}

export async function getTraitsBundle(cdNom: number): Promise<{
  cdNom: number;
  lbNom: string;
  nomVern: string | null;
  bySource: TraitsBySourceOut[];
} | null> {
  const taxRows = await db.execute(sql`
    SELECT cd_nom, lb_nom, nom_vern FROM taxons WHERE cd_nom = ${cdNom} LIMIT 1
  `);
  const tx = rowsOf<{ cd_nom: number; lb_nom: string; nom_vern: string | null }>(taxRows)[0];
  if (!tx) return null;

  const traitRows = await db.execute(sql`
    SELECT source, traits FROM species_traits
    WHERE cd_nom = ${cdNom} AND source IN ('pantheria', 'avonet', 'amphibio')
  `);
  const rows = rowsOf<{ source: TraitSource; traits: Record<string, { label: string; value: string; unit?: string }> | null }>(traitRows);

  const bySource: TraitsBySourceOut[] = [];
  for (const r of rows) {
    if (!r.traits || typeof r.traits !== "object") continue;
    const fields: TraitFieldOut[] = Object.entries(r.traits)
      .filter(([, v]) => v && typeof v === "object" && typeof v.value === "string")
      .map(([key, v]) => ({ key, label: v.label, value: v.value, unit: v.unit }));
    if (fields.length > 0) bySource.push({ source: r.source, fields });
  }

  return {
    cdNom: tx.cd_nom,
    lbNom: tx.lb_nom,
    nomVern: tx.nom_vern,
    bySource,
  };
}
