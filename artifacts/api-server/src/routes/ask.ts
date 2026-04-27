import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

type Msg = { role: "user" | "assistant"; content: string };

interface Filters {
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
  countOnly?: boolean;
  limit?: number;
}

const REGNE_HINTS: Record<string, string> = {
  animaux: "Animalia", animal: "Animalia", faune: "Animalia",
  plantes: "Plantae", plante: "Plantae", flore: "Plantae", "vegetaux": "Plantae", "végétaux": "Plantae",
  champignons: "Fungi", champignon: "Fungi", fungi: "Fungi",
  bacteries: "Bacteria", "bactéries": "Bacteria",
};

const TOOL_DEFS = [
  {
    name: "status_breakdown",
    description:
      "Retourne la répartition des taxons par code de statut, pour un type de statut donné. À utiliser quand l'utilisateur demande une vue agrégée 'par statut' (ex: répartition Liste Rouge, combien d'espèces dans chaque catégorie UICN, breakdown des protégées par annexe, etc.). Les filtres taxonomiques (regne, classe, etc.) restreignent la portée. Le résultat te donne, pour chaque code, le libellé et le nombre de taxons concernés.",
    input_schema: {
      type: "object" as const,
      properties: {
        statutType: {
          type: "string",
          description: "OBLIGATOIRE. Code du type de statut : LRM, LRE, LRN, LRR, PN, PR, PD, POM, DH, DO, BERN, BONN, BARC, OSPAR, ZDET, PNA, exPNA, SENSNAT, SENSREG, SENSDEP, REGL, REGLII, REGLLUTTE, REGLSO."
        },
        regne: { type: "string", description: "Filtrer par règne (Animalia, Plantae, Fungi...)." },
        classe: { type: "string", description: "Filtrer par classe (Mammalia, Aves, Insecta...)." },
        ordre: { type: "string", description: "Filtrer par ordre." },
        famille: { type: "string", description: "Filtrer par famille." },
        genre: { type: "string", description: "Filtrer par genre." },
        groupe2Inpn: { type: "string", description: "Filtrer par grand groupe INPN (Mammifères, Oiseaux, Reptiles...)." },
        cdSig: { type: "string", description: "Restreindre à un territoire (ex: METRO, 11, 75)." },
      },
      required: ["statutType"],
      additionalProperties: false,
    },
  },
  {
    name: "query_taxa",
    description:
      "Recherche des taxons dans TAXREF v18 selon des filtres. Utilise ce tool pour répondre à toute question portant sur des espèces, leur conservation, leur répartition ou leur taxonomie. Le résultat te donne le nombre total ainsi qu'un échantillon. Tu peux ensuite formuler une réponse en français pour l'utilisateur.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Nom scientifique ou vernaculaire (recherche partielle insensible à la casse)." },
        regne: { type: "string", description: "Règne TAXREF, ex: Animalia, Plantae, Fungi, Bacteria, Chromista, Protozoa, Archaea." },
        phylum: { type: "string", description: "Embranchement (phylum), ex: Chordata, Arthropoda, Mollusca, Tracheophyta..." },
        classe: { type: "string", description: "Classe, ex: Mammalia, Aves, Reptilia, Amphibia, Actinopterygii, Insecta, Magnoliopsida..." },
        ordre: { type: "string", description: "Ordre, ex: Carnivora, Passeriformes, Lepidoptera..." },
        famille: { type: "string", description: "Famille, ex: Canidae, Felidae, Orchidaceae..." },
        genre: { type: "string", description: "Genre, ex: Vulpes, Canis..." },
        rang: { type: "string", description: "Rang taxonomique TAXREF (ES, GN, FM, OR, CL, PH, KD, SSES, ...). Par défaut, espèces (ES)." },
        statutType: {
          type: "string",
          description: "Code du type de statut. Codes valides: LRM (LR mondiale), LRE (LR européenne), LRN (LR nationale), LRR (LR régionale), PN (Protection nationale), PR (Protection régionale), PD (Protection départementale), POM (Protection COM), DH (Directive Habitats), DO (Directive Oiseaux), BERN, BONN, BARC, OSPAR, ZDET (ZNIEFF déterminantes), PNA (Plan national en cours), exPNA, SENSNAT, SENSREG, SENSDEP, REGL, REGLII (interdiction d'introduction = invasives), REGLLUTTE, REGLSO."
        },
        statutCode: { type: "string", description: "Code du statut (ex: CR, EN, VU, NT, LC, DD, NA pour les listes rouges; A2, A3, B2 pour Berne; II, IV pour DH...)." },
        cdSig: { type: "string", description: "Code SIG du territoire (région ou département). Ex: METRO (France métropolitaine), 11 (Île-de-France), 75 (Paris)... Laisse vide si pas précisé." },
        groupe2Inpn: { type: "string", description: "Grand groupe vernaculaire INPN (ex: Mammifères, Oiseaux, Reptiles, Amphibiens, Poissons, Insectes, Plantes à fleurs)." },
        habitat: { type: "string", description: "Code habitat: 1=marin, 2=eau douce, 3=terrestre, 4=marin/eau douce, 5=marin/terrestre, 6=eau douce/terrestre, 7=marin/eau douce/terrestre, 8=continental." },
        countOnly: { type: "boolean", description: "Si true, ne retourne que le compte (utile pour 'combien y a-t-il...?')." },
        limit: { type: "number", description: "Nombre max d'exemples à renvoyer (défaut 12, max 30)." },
      },
      additionalProperties: false,
    },
  },
];

interface BreakdownFilters {
  statutType: string;
  regne?: string;
  classe?: string;
  ordre?: string;
  famille?: string;
  genre?: string;
  groupe2Inpn?: string;
  cdSig?: string;
}

async function runStatusBreakdown(filters: BreakdownFilters) {
  const conds: any[] = [
    sql`t.cd_nom = t.cd_ref`,
    sql`t.rang = 'ES'`,
    sql`s.cd_type_statut = ${filters.statutType}`,
  ];
  for (const [k, col] of [
    ["regne", "regne"], ["classe", "classe"], ["ordre", "ordre"],
    ["famille", "famille"], ["genre", "genre"], ["groupe2Inpn", "group2_inpn"],
  ] as const) {
    const v = (filters as any)[k];
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
  const rows = ((rowsRes as any).rows ?? rowsRes) as Array<{ code: string; label: string | null; count: number }>;
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  return { totalCount, breakdown: rows };
}

async function runQuery(filters: Filters) {
  const conds: any[] = [sql`t.cd_nom = t.cd_ref`];
  const params: any = {};

  const rang = filters.rang ?? "ES";
  if (rang) conds.push(sql`t.rang = ${rang}`);

  if (filters.name) {
    const pat = `%${filters.name.trim()}%`;
    conds.push(sql`(t.lb_nom ILIKE ${pat} OR t.nom_vern ILIKE ${pat})`);
  }
  for (const [k, col] of [
    ["regne", "regne"], ["phylum", "phylum"], ["classe", "classe"],
    ["ordre", "ordre"], ["famille", "famille"], ["genre", "genre"],
    ["groupe2Inpn", "group2_inpn"], ["habitat", "habitat"],
  ] as const) {
    const v = (filters as any)[k];
    if (v) conds.push(sql`t.${sql.raw(col)} ILIKE ${v}`);
  }

  if (filters.statutType || filters.statutCode || filters.cdSig) {
    const subConds: any[] = [sql`s.cd_nom = t.cd_nom`];
    if (filters.statutType) subConds.push(sql`s.cd_type_statut = ${filters.statutType}`);
    if (filters.statutCode) subConds.push(sql`s.code_statut = ${filters.statutCode}`);
    if (filters.cdSig) subConds.push(sql`s.cd_sig = ${filters.cdSig}`);
    conds.push(sql`EXISTS (SELECT 1 FROM bdc_statuts s WHERE ${sql.join(subConds, sql` AND `)})`);
  }

  const whereSql = sql.join(conds, sql` AND `);
  const limit = Math.min(Math.max(filters.limit ?? 12, 1), 30);

  const countRow = await db.execute(sql`SELECT COUNT(*)::int AS c FROM taxons t WHERE ${whereSql}`);
  const totalCount = ((countRow as any).rows ?? countRow)[0]?.c ?? 0;

  const rowsResult = await db.execute(sql`
    SELECT t.cd_nom, t.lb_nom, t.nom_vern, t.rang, t.regne, t.classe, t.ordre, t.famille
    FROM taxons t
    WHERE ${whereSql}
    ORDER BY t.lb_nom
    LIMIT ${limit}
  `);
  const items = ((rowsResult as any).rows ?? rowsResult).map((r: any) => ({
    cdNom: r.cd_nom as number,
    lbNom: r.lb_nom as string,
    nomVern: r.nom_vern as string | null,
    rang: r.rang as string,
    regne: r.regne as string | null,
    classe: r.classe as string | null,
    ordre: r.ordre as string | null,
    famille: r.famille as string | null,
  }));

  return { totalCount, items };
}

router.post("/ask", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const history: Msg[] = Array.isArray(body.history) ? body.history.slice(-10) : [];
  if (!question) { res.status(400).json({ error: "question required" }); return; }

  const systemPrompt = `Tu es l'assistant de l'application ALI Species, un explorateur du référentiel taxonomique français TAXREF v18 (≈ 708 000 taxons couvrant la flore, la faune et les champignons de France métropolitaine et d'outre-mer).

Tu réponds toujours en français, de manière concise (2-4 phrases), naturelle et précise.

Tu disposes de deux tools :
- "query_taxa" : pour lister/compter des taxons selon des filtres (taxonomie, statut, territoire...). Utilise-le pour répondre à toute question portant sur des espèces.
- "status_breakdown" : pour obtenir la répartition agrégée des taxons par code de statut, pour un type de statut donné. Utilise-le quand l'utilisateur demande une vue "par statut" / "par catégorie" / "répartition" / "ventilation" — par exemple : "répartition Liste Rouge des oiseaux", "combien d'espèces dans chaque catégorie UICN", "breakdown des protégées par annexe", "statut par statut".

Quand le résultat est revenu, formule une réponse synthétique en français qui :
- Donne le compte total trouvé (en chiffres formatés)
- Pour query_taxa : mentionne 2-4 exemples emblématiques s'il y a lieu
- Pour status_breakdown : présente la ventilation (ex: "Sur 379 oiseaux évalués, 12 en danger critique, 25 en danger, 48 vulnérables...")
- N'inclut PAS la liste complète (l'interface affiche automatiquement des cartes cliquables sous ta réponse pour query_taxa)
- Invite à cliquer sur les cartes pour voir le détail
- N'utilise JAMAIS countOnly=true (le paramètre est ignoré, on retourne toujours un échantillon en plus du compte)

Indices pour traduire une question:
- "mammifères" → classe=Mammalia ou groupe2Inpn=Mammifères
- "oiseaux" → classe=Aves ou groupe2Inpn=Oiseaux
- "reptiles" → classe=Reptilia
- "amphibiens" → classe=Amphibia
- "poissons" → classe=Actinopterygii (poissons osseux)
- "insectes" → classe=Insecta
- "plantes à fleurs" → classe=Magnoliopsida
- "fougères" → classe=Polypodiopsida
- "champignons" → regne=Fungi
- "espèces protégées (en France)" → statutType=PN
- "liste rouge nationale" → statutType=LRN (ajoute statutCode=CR/EN/VU pour menacées)
- "espèces menacées" → statutType=LRN, statutCode=CR ou EN ou VU (fais 1 requête par catégorie ou laisse code vide et explique)
- "invasives" / "interdites d'introduction" → statutType=REGLII
- "ZNIEFF déterminantes" → statutType=ZDET
- "directive habitats/oiseaux" → DH ou DO

Si la question ne porte pas sur les taxons (ex: "qui es-tu ?"), réponds sans utiliser le tool.`;

  const messages: any[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  let lastQueryResult: { totalCount: number; items: any[] } | null = null;
  let usedFilters: Filters | null = null;

  for (let turn = 0; turn < 4; turn++) {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOL_DEFS as any,
      messages,
    });

    const toolUses = resp.content.filter((c: any) => c.type === "tool_use");
    const textParts = resp.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();

    if (toolUses.length === 0 || resp.stop_reason !== "tool_use") {
      res.json({
        reply: textParts || "Je n'ai pas trouvé de réponse précise.",
        results: lastQueryResult?.items ?? [],
        totalCount: lastQueryResult?.totalCount ?? 0,
        filters: usedFilters,
      });
      return;
    }

    messages.push({ role: "assistant", content: resp.content });

    const toolResults: any[] = [];
    for (const tu of toolUses as any[]) {
      try {
        if (tu.name === "query_taxa") {
          const filters = (tu.input ?? {}) as Filters;
          if (filters.regne && REGNE_HINTS[filters.regne.toLowerCase()]) {
            filters.regne = REGNE_HINTS[filters.regne.toLowerCase()];
          }
          const result = await runQuery(filters);
          lastQueryResult = result;
          usedFilters = filters;
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({
              totalCount: result.totalCount,
              sample: result.items.slice(0, 12).map((it) => ({
                cdNom: it.cdNom,
                lbNom: it.lbNom,
                nomVern: it.nomVern,
                classe: it.classe,
                famille: it.famille,
              })),
            }),
          });
        } else if (tu.name === "status_breakdown") {
          const filters = (tu.input ?? {}) as BreakdownFilters;
          if (filters.regne && REGNE_HINTS[filters.regne.toLowerCase()]) {
            filters.regne = REGNE_HINTS[filters.regne.toLowerCase()];
          }
          const result = await runStatusBreakdown(filters);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({
              statutType: filters.statutType,
              totalTaxons: result.totalCount,
              breakdown: result.breakdown,
            }),
          });
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "Tool inconnu", is_error: true });
        }
      } catch (e: any) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Erreur: ${e.message ?? "inconnue"}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  res.json({
    reply: "Je n'ai pas réussi à formuler une réponse en quelques étapes.",
    results: lastQueryResult?.items ?? [],
    totalCount: lastQueryResult?.totalCount ?? 0,
    filters: usedFilters,
  });
});

export default router;
