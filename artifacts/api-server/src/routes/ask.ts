import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getInteractionsForCdNom } from "./interactions.js";

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
    name: "get_interactions",
    description:
      "Retourne le réseau trophique d'un taxon depuis Global Biotic Interactions (GloBI) : ce qu'il consomme, ce qui le consomme, parasites/hôtes, plantes pollinisées. Utilise ce tool quand l'utilisateur demande qui mange qui, les proies, prédateurs, parasites, ou interactions écologiques d'une espèce. Tu dois d'abord obtenir le cdNom du taxon (avec query_taxa si besoin). Le résultat te donne un compte par groupe et un échantillon de partenaires.",
    input_schema: {
      type: "object" as const,
      properties: {
        cdNom: { type: "number", description: "Identifiant TAXREF (cdNom) du taxon source." },
      },
      required: ["cdNom"],
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

const QUESTION_KEYWORDS = [
  "combien", "quel", "quels", "quelle", "quelles", "qui", "quoi", "où", "ou est", "comment", "pourquoi",
  "liste", "donne", "donnez", "montre", "montrez", "affiche", "trouve", "cherche", "cite",
  "qu'est", "c'est quoi", "explique", "raconte", "parle", "dis", "compte", "comptez",
  "ventile", "ventilation", "répartition", "repartition", "breakdown", "statut", "statuts", "par statut",
  "menacé", "menace", "menacée", "menacees", "menacés", "menacees",
  "protégé", "protege", "protégée", "protegee", "protégés", "proteges",
  "rouge", "vulnérable", "vulnerable", "danger", "uicn",
  "famille de", "famille des", "espèces de", "especes de", "espèce de", "espece de",
  "réseau", "reseau", "trophique", "mange", "mangé", "consomme", "prédateur", "predateur",
  "et ", " ou ", " avec ", " dans ", " sur ", " pour ",
];

function looksLikeSpeciesName(q: string): boolean {
  const s = q.trim();
  if (!s || s.length > 60) return false;
  if (/[?!]/.test(s)) return false;
  const tokens = s.split(/\s+/);
  if (tokens.length === 0 || tokens.length > 5) return false;
  const low = s.toLowerCase();
  for (const w of QUESTION_KEYWORDS) {
    if (low.includes(w)) return false;
  }
  return true;
}

async function findExactSpecies(q: string): Promise<any[]> {
  const trimmed = q.trim();
  const rowsRes = await db.execute(sql`
    SELECT cd_nom, lb_nom, nom_vern, rang, regne, classe, ordre, famille,
      CASE
        WHEN LOWER(lb_nom) = LOWER(${trimmed}) THEN 0
        WHEN LOWER(nom_vern) = LOWER(${trimmed}) THEN 1
        WHEN ', ' || LOWER(COALESCE(nom_vern, '')) || ',' LIKE '%, ' || LOWER(${trimmed}) || ',%' THEN 2
        WHEN LOWER(lb_nom) LIKE LOWER(${trimmed}) || '%' THEN 3
        ELSE 4
      END AS priority
    FROM taxons
    WHERE cd_nom = cd_ref
      AND (
        LOWER(lb_nom) = LOWER(${trimmed})
        OR LOWER(nom_vern) = LOWER(${trimmed})
        OR ', ' || LOWER(COALESCE(nom_vern, '')) || ',' LIKE '%, ' || LOWER(${trimmed}) || ',%'
        OR LOWER(lb_nom) LIKE LOWER(${trimmed}) || '%'
      )
    ORDER BY priority,
      CASE WHEN rang = 'ES' THEN 0 ELSE 1 END,
      lb_nom
    LIMIT 5
  `);
  const rows = ((rowsRes as any).rows ?? rowsRes) as any[];
  return rows
    .filter((r) => r.priority < 4)
    .map((r) => ({
      cdNom: r.cd_nom as number,
      lbNom: r.lb_nom as string,
      nomVern: r.nom_vern as string | null,
      rang: r.rang as string,
      regne: r.regne as string | null,
      classe: r.classe as string | null,
      ordre: r.ordre as string | null,
      famille: r.famille as string | null,
    }));
}

router.post("/ask", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const history: Msg[] = Array.isArray(body.history) ? body.history.slice(-10) : [];
  if (!question) { res.status(400).json({ error: "question required" }); return; }

  // Fast path: if the question looks like just a species name, look it up directly
  // and skip the LLM call entirely.
  if (history.length === 0 && looksLikeSpeciesName(question)) {
    try {
      const items = await findExactSpecies(question);
      if (items.length > 0) {
        const top = items[0];
        const vern = top.nomVern ? ` (${top.nomVern.split(",")[0].trim()})` : "";
        const reply = items.length === 1
          ? `Voici ${top.lbNom}${vern}. Cliquez sur la fiche pour explorer ses statuts, sa classification et son réseau trophique.`
          : `${items.length} taxons correspondent à « ${question} ». Cliquez sur une fiche pour voir le détail.`;
        res.json({
          reply,
          results: items,
          totalCount: items.length,
          filters: { name: question },
        });
        return;
      }
    } catch {
      // fall through to LLM path
    }
  }

  const systemPrompt = `Tu es l'assistant de l'application ALI Species, un explorateur du référentiel taxonomique français TAXREF v18 (≈ 708 000 taxons couvrant la flore, la faune et les champignons de France métropolitaine et d'outre-mer).

Tu réponds toujours en français, de manière concise (2-4 phrases), naturelle et précise.

Tu disposes de trois tools :
- "query_taxa" : pour lister/compter des taxons selon des filtres (taxonomie, statut, territoire...). Utilise-le pour répondre à toute question portant sur des espèces.
- "status_breakdown" : pour obtenir la répartition agrégée des taxons par code de statut, pour un type de statut donné. Utilise-le quand l'utilisateur demande une vue "par statut" / "par catégorie" / "répartition" / "ventilation" — par exemple : "répartition Liste Rouge des oiseaux", "combien d'espèces dans chaque catégorie UICN", "breakdown des protégées par annexe", "statut par statut".
- "get_interactions" : pour obtenir le réseau trophique d'une espèce depuis GloBI (proies, prédateurs, parasites, pollinisation). Utilise-le quand l'utilisateur demande "qui mange qui", "que mange X", "quels sont les prédateurs de X", "parasites de X", "interactions de X". Si tu n'as pas le cdNom du taxon, fais d'abord un query_taxa pour le récupérer, puis appelle get_interactions.

Quand le résultat est revenu, formule une réponse synthétique en français qui :
- Donne le compte total trouvé (en chiffres formatés)
- Pour query_taxa : mentionne 2-4 exemples emblématiques s'il y a lieu
- Pour status_breakdown : présente la ventilation (ex: "Sur 379 oiseaux évalués, 12 en danger critique, 25 en danger, 48 vulnérables...")
- Pour get_interactions : résume les groupes (ex: "L'écureuil roux interagit avec 337 partenaires : il consomme 161 espèces (noisettes, faînes, champignons...), est consommé par 142 prédateurs (rapaces, mustélidés...), héberge 30 parasites et pollinise 4 plantes."). Mentionne quelques exemples par groupe.
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
        } else if (tu.name === "get_interactions") {
          const cdNom = Number((tu.input ?? {}).cdNom);
          if (!cdNom || Number.isNaN(cdNom)) {
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "cdNom invalide", is_error: true });
          } else {
            const payload = await getInteractionsForCdNom(cdNom);
            if (!payload) {
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Aucun taxon pour cdNom=${cdNom}`, is_error: true });
            } else {
              const summary = {
                sourceTaxon: payload.sourceTaxon,
                cdNom: payload.cdNom,
                totalPartners: payload.totalPartners,
                groups: payload.groups.map((g: any) => ({
                  id: g.id,
                  label: g.label,
                  count: g.count,
                  topPartners: g.partners.slice(0, 8).map((p: any) => ({
                    name: p.name,
                    nomVern: p.nomVern,
                    cdNom: p.cdNom,
                  })),
                })),
              };
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify(summary),
              });
            }
          }
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
