import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getInteractionsForCdNom, type InteractionGroup, type InteractionPartner } from "./interactions.js";
import { runStatusBreakdown, type BreakdownFilters } from "../lib/breakdown.js";
import { looksLikeSpeciesName } from "../lib/heuristics.js";
import { runQuery, type Filters, type SpeciesItem } from "../lib/query.js";
import { runTraitQuery, getTraitsBundle, TRAIT_KEYS, TRAIT_SOURCES, type TraitFilters } from "../lib/traitsQuery.js";
import { STATUT_CODE_REAL_DOC } from "../lib/statutCodeAlias.js";

const queryTraitsInputSchema = z
  .object({
    source: z.enum(TRAIT_SOURCES as unknown as [string, ...string[]]),
    traitKey: z.string().optional(),
    minValue: z.coerce.number().optional(),
    maxValue: z.coerce.number().optional(),
    valueContains: z.string().min(1).max(80).optional(),
    sortBy: z.enum(["value_asc", "value_desc", "name"]).optional(),
    regne: z.string().min(1).max(80).optional(),
    classe: z.string().min(1).max(80).optional(),
    ordre: z.string().min(1).max(80).optional(),
    famille: z.string().min(1).max(80).optional(),
    groupe2Inpn: z.string().min(1).max(80).optional(),
    statutType: z.string().min(1).max(20).optional(),
    statutCode: z.string().min(1).max(20).optional(),
    cdSig: z.string().min(1).max(20).optional(),
    limit: z.coerce.number().int().min(1).max(30).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.traitKey && !TRAIT_KEYS[v.source as keyof typeof TRAIT_KEYS].includes(v.traitKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["traitKey"],
        message: `traitKey '${v.traitKey}' invalide pour source '${v.source}'. Valeurs autorisées: ${TRAIT_KEYS[v.source as keyof typeof TRAIT_KEYS].join(", ")}`,
      });
    }
    if ((v.sortBy === "value_asc" || v.sortBy === "value_desc") && !v.traitKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sortBy"],
        message: "sortBy=value_asc/value_desc nécessite un traitKey numérique.",
      });
    }
    if (v.minValue !== undefined && v.maxValue !== undefined && v.minValue > v.maxValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minValue"],
        message: "minValue doit être <= maxValue.",
      });
    }
  });

const getTraitsInputSchema = z.object({
  cdNom: z.coerce.number().int().positive(),
});

const router: IRouter = Router();

const ANTHROPIC_TIMEOUT_MS = 30_000;
const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CONTENT = 2_000;

const askBodySchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(MAX_HISTORY_CONTENT),
      }),
    )
    .max(MAX_HISTORY_MESSAGES)
    .optional()
    .default([]),
});

type Msg = z.infer<typeof askBodySchema>["history"][number];

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
    name: "query_traits",
    description:
      "Filtre, trie et liste des espèces selon leurs traits biologiques (mesures écologiques et morphologiques) issus des bases PanTHERIA (mammifères), AVONET (oiseaux) ou AmphiBIO (amphibiens). Utilise ce tool pour répondre à toute question quantitative sur des traits : 'le plus gros mammifère', 'oiseaux avec la plus grande envergure', 'amphibiens avec la ponte la plus faible', 'rapaces protégés triés par masse', 'mammifères carnivores avec longévité > 20 ans', etc. Tu peux combiner avec un filtre statut (statutType + statutCode) et un filtre taxonomique (classe, ordre, famille). IMPORTANT: choisis la bonne 'source' selon le groupe (mammifères=pantheria, oiseaux=avonet, amphibiens=amphibio). Si tu veux trier ou filtrer par valeur, fournis 'traitKey' parmi la liste autorisée. Si tu veux juste lister les taxa qui ont des traits dans une source, omets traitKey.",
    input_schema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          enum: ["pantheria", "avonet", "amphibio"],
          description: "OBLIGATOIRE. Base de traits à interroger. pantheria=mammifères, avonet=oiseaux, amphibio=amphibiens.",
        },
        traitKey: {
          type: "string",
          description: `Clé du trait à filtrer/trier. Clés valides par source — pantheria: ${TRAIT_KEYS.pantheria.join(", ")}. avonet: ${TRAIT_KEYS.avonet.join(", ")}. amphibio: ${TRAIT_KEYS.amphibio.join(", ")}. Choisis la clé qui correspond à la question (ex: 'le plus gros mammifère' → adultBodyMass, 'envergure des oiseaux' → wingLen, 'ponte amphibiens' → litterMax ou reproOutput).`,
        },
        minValue: { type: "number", description: "Valeur minimale (sur le 'raw' numérique du trait). Optionnel." },
        maxValue: { type: "number", description: "Valeur maximale (sur le 'raw' numérique du trait). Optionnel." },
        valueContains: { type: "string", description: "Sous-chaîne à chercher dans la valeur textuelle du trait (utile pour traits catégoriels). VALEURS RÉELLES en français : avonet trophicNiche=Nectarivore|Frugivore|Granivore|Invertivore|Omnivore|Charognard|'Vertivore (vertébrés)'|'Herbivore terrestre'|'Herbivore aquatique'|'Prédateur aquatique' ; avonet trophicLevel=Carnivore|Herbivore|Omnivore|Scavenger ; avonet lifestyle=Aérien|Aquatique|Insessorial|Généraliste|Terrestre ; avonet migration='Migration partielle'|Sédentaire|Migrateur ; pantheria activity=Diurne|Nocturne ; amphibio diet=Carnivore|Herbivore|Omnivore. Exemple : 'oiseaux nectarivores' → source=avonet, traitKey=trophicNiche, valueContains=Nectarivore." },
        sortBy: {
          type: "string",
          enum: ["value_desc", "value_asc", "name"],
          description: "Tri du résultat. 'value_desc' = du plus grand au plus petit (ex: plus grosse masse). 'value_asc' = du plus petit au plus grand. 'name' = alphabétique. Nécessite traitKey numérique pour value_*.",
        },
        regne: { type: "string", description: "Filtrer par règne." },
        classe: { type: "string", description: "Filtrer par classe (Mammalia, Aves, Amphibia...)." },
        ordre: { type: "string", description: "Filtrer par ordre (Carnivora, Passeriformes...)." },
        famille: { type: "string", description: "Filtrer par famille." },
        groupe2Inpn: { type: "string", description: "Grand groupe INPN (Mammifères, Oiseaux, Amphibiens...)." },
        statutType: { type: "string", description: "Code de type de statut pour restreindre aux taxa ayant ce statut (PN, LRN, DH, DO, REGLII, ZDET, etc.)." },
        statutCode: { type: "string", description: `Code de statut. ${STATUT_CODE_REAL_DOC}` },
        cdSig: { type: "string", description: "Code SIG du territoire (METRO, 11, 75...)." },
        limit: { type: "number", description: "Nombre max de résultats (défaut 12, max 30)." },
      },
      required: ["source"],
      additionalProperties: false,
    },
  },
  {
    name: "get_traits",
    description:
      "Retourne tous les traits biologiques connus pour un taxon (PanTHERIA + AVONET + AmphiBIO selon disponibilité). Utilise ce tool quand l'utilisateur demande les caractéristiques, traits, mensurations, écologie d'une espèce précise (ex: 'quels sont les traits du loup', 'combien pèse le rouge-gorge', 'longévité du sonneur'). Si tu n'as pas le cdNom, fais d'abord query_taxa.",
    input_schema: {
      type: "object" as const,
      properties: {
        cdNom: { type: "number", description: "Identifiant TAXREF (cdNom) du taxon." },
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
        name: { type: "string", description: "Nom scientifique OU vernaculaire en recherche libre. ATTENTION : si l'utilisateur précise explicitement un rang taxonomique (genre X, famille Y, ordre Z, classe W), utilise PLUTÔT le filtre dédié (`genre`, `famille`, `ordre`, `classe`) — sinon `name` peut matcher par hasard d'autres taxons (ex: `name=Ophrys` matcherait Callophrys, Ceratophrys… alors que `genre=Ophrys` ne donne que les vraies Ophrys orchidées)." },
        regne: { type: "string", description: "Règne TAXREF, ex: Animalia, Plantae, Fungi, Bacteria, Chromista, Protozoa, Archaea." },
        phylum: { type: "string", description: "Embranchement (phylum), ex: Chordata, Arthropoda, Mollusca, Tracheophyta..." },
        classe: { type: "string", description: "Classe, ex: Mammalia, Aves, Reptilia, Amphibia, Actinopterygii, Insecta, Magnoliopsida..." },
        ordre: { type: "string", description: "Ordre, ex: Carnivora, Passeriformes, Lepidoptera..." },
        famille: { type: "string", description: "Famille, ex: Canidae, Felidae, Orchidaceae..." },
        genre: { type: "string", description: "Genre taxonomique (premier mot du nom binomial), ex: Vulpes, Canis, Ophrys, Quercus. À UTILISER systématiquement quand l'utilisateur dit 'du genre X' / 'genus X' / 'espèces du genre X'." },
        rang: { type: "string", description: "Rang taxonomique TAXREF (ES, GN, FM, OR, CL, PH, KD, SSES, ...). Par défaut, espèces (ES)." },
        statutType: {
          type: "string",
          description: "Code du type de statut. Codes valides: LRM (LR mondiale), LRE (LR européenne), LRN (LR nationale), LRR (LR régionale), PN (Protection nationale), PR (Protection régionale), PD (Protection départementale), POM (Protection COM), DH (Directive Habitats), DO (Directive Oiseaux), BERN, BONN, BARC, OSPAR, ZDET (ZNIEFF déterminantes), PNA (Plan national en cours), exPNA, SENSNAT, SENSREG, SENSDEP, REGL, REGLII (interdiction d'introduction = invasives), REGLLUTTE, REGLSO."
        },
        statutCode: { type: "string", description: STATUT_CODE_REAL_DOC },
        cdSig: { type: "string", description: "Code SIG du territoire (région ou département). Ex: METRO (France métropolitaine), 11 (Île-de-France), 75 (Paris)... Laisse vide si pas précisé." },
        groupe2Inpn: { type: "string", description: "Grand groupe vernaculaire INPN (ex: Mammifères, Oiseaux, Reptiles, Amphibiens, Poissons, Insectes, Plantes à fleurs)." },
        habitat: { type: "string", description: "Code habitat: 1=marin, 2=eau douce, 3=terrestre, 4=marin/eau douce, 5=marin/terrestre, 6=eau douce/terrestre, 7=marin/eau douce/terrestre, 8=continental." },
        limit: { type: "number", description: "Nombre max d'exemples à renvoyer (défaut 12, max 30)." },
      },
      additionalProperties: false,
    },
  },
];

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

interface DbExecuteResult<T> { rows?: T[] }
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

async function findExactSpecies(q: string): Promise<SpeciesItem[]> {
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
  const rows = rowsOf<TaxonRow & { priority: number }>(rowsRes);
  return rows
    .filter((r) => r.priority < 4)
    .map(mapTaxonRow);
}

router.post("/ask", async (req, res): Promise<void> => {
  const parsed = askBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid request body",
      details: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return;
  }
  const { question, history } = parsed.data;

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

Tu disposes de cinq tools :
- "query_taxa" : pour lister/compter des taxons selon des filtres (taxonomie, statut, territoire...). Utilise-le pour répondre à toute question portant sur des espèces.
- "status_breakdown" : pour obtenir la répartition agrégée des taxons par code de statut, pour un type de statut donné. Utilise-le quand l'utilisateur demande une vue "par statut" / "par catégorie" / "répartition" / "ventilation" — par exemple : "répartition Liste Rouge des oiseaux", "combien d'espèces dans chaque catégorie UICN", "breakdown des protégées par annexe", "statut par statut".
- "get_interactions" : pour obtenir le réseau trophique d'une espèce depuis GloBI (proies, prédateurs, parasites, pollinisation). Utilise-le quand l'utilisateur demande "qui mange qui", "que mange X", "quels sont les prédateurs de X", "parasites de X", "interactions de X". Si tu n'as pas le cdNom du taxon, fais d'abord un query_taxa pour le récupérer, puis appelle get_interactions.
- "query_traits" : pour filtrer/trier des espèces par trait biologique (masse, longueur, longévité, ponte, envergure, régime, habitat, mode d'activité, etc.) issu de PanTHERIA (mammifères), AVONET (oiseaux) ou AmphiBIO (amphibiens). Utilise-le pour toute question quantitative ou comparative sur les traits : "le plus gros mammifère protégé", "rapaces triés par envergure", "amphibiens EN avec la ponte la plus faible", "carnivores avec longévité > 20 ans", "oiseaux nectarivores", etc. Tu peux combiner avec un statut (statutType) et un filtre taxonomique.
- "get_traits" : pour obtenir les traits biologiques d'une espèce précise (ex: "combien pèse le loup", "longévité du sonneur", "envergure de l'aigle royal"). Si tu n'as pas le cdNom, fais d'abord query_taxa.

Quand le résultat est revenu, formule une réponse synthétique en français qui :
- Donne le compte total trouvé (en chiffres formatés)
- Pour query_taxa : mentionne 2-4 exemples emblématiques s'il y a lieu
- Pour status_breakdown : présente la ventilation (ex: "Sur 379 oiseaux évalués, 12 en danger critique, 25 en danger, 48 vulnérables...")
- Pour get_interactions : résume les groupes (ex: "L'écureuil roux interagit avec 337 partenaires : il consomme 161 espèces (noisettes, faînes, champignons...), est consommé par 142 prédateurs (rapaces, mustélidés...), héberge 30 parasites et pollinise 4 plantes."). Mentionne quelques exemples par groupe.
- Pour query_traits : annonce le tri/filtre appliqué et cite 3-5 espèces en tête avec leur valeur (ex: "Top 5 par masse adulte (PanTHERIA) : Ours brun 167 kg, Loup gris 32 kg, Lynx boréal 21 kg, Sanglier 87 kg, Cerf élaphe 144 kg.")
- Pour get_traits : présente les traits clés par source (ex: "Loup gris — PanTHERIA : masse 32 kg, longévité 16 ans, gestation 63 jours, taille de portée 5. Wikidata : longueur 1,4 m.")
- N'inclut PAS la liste complète (l'interface affiche automatiquement des cartes cliquables sous ta réponse pour query_taxa et query_traits)
- Invite à cliquer sur les cartes pour voir le détail

Règle critique sur les filtres taxonomiques :
- "du genre X" / "genus X" / "espèces du genre X" → utilise filtre genre=X (PAS name=X, qui ferait une recherche par sous-chaîne et matcherait des taxons sans rapport ; ex: name=Ophrys matche Callophrys, Acanthophrys…).
- "de la famille X" / "family X" → utilise filtre famille=X.
- "de l'ordre X" / "order X" → utilise filtre ordre=X.
- "de la classe X" / "class X" → utilise filtre classe=X.
- N'utilise name que pour une recherche libre par nom scientifique ou vernaculaire (ex: "loup", "Vulpes vulpes", "rouge-gorge").

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

  let lastQueryResult: { totalCount: number; items: SpeciesItem[] } | null = null;
  let usedFilters: Filters | null = null;

  for (let turn = 0; turn < 4; turn++) {
    let resp;
    try {
      resp = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system: systemPrompt,
          tools: TOOL_DEFS as any,
          messages,
        },
        { timeout: ANTHROPIC_TIMEOUT_MS },
      );
    } catch (err) {
      const isTimeout =
        (err as { name?: string })?.name === "APIConnectionTimeoutError" ||
        /timeout/i.test((err as Error)?.message ?? "");
      res.status(isTimeout ? 504 : 502).json({
        reply: isTimeout
          ? "Le service IA met trop de temps à répondre. Réessayez dans un instant."
          : "Le service IA est momentanément indisponible. Réessayez plus tard.",
        results: lastQueryResult?.items ?? [],
        totalCount: lastQueryResult?.totalCount ?? 0,
        filters: usedFilters,
      });
      return;
    }

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
                groups: payload.groups.map((g: InteractionGroup) => ({
                  id: g.id,
                  label: g.label,
                  count: g.count,
                  topPartners: g.partners.slice(0, 8).map((p: InteractionPartner) => ({
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
        } else if (tu.name === "query_traits") {
          const parsed = queryTraitsInputSchema.safeParse(tu.input ?? {});
          if (!parsed.success) {
            const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join(" | ");
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Paramètres invalides — ${msg}`, is_error: true });
          } else {
            const filters = parsed.data as TraitFilters;
            if (filters.regne && REGNE_HINTS[filters.regne.toLowerCase()]) {
              filters.regne = REGNE_HINTS[filters.regne.toLowerCase()];
            }
            const result = await runTraitQuery(filters);
            lastQueryResult = {
              totalCount: result.totalCount,
              items: result.items.map((it) => ({
                cdNom: it.cdNom,
                lbNom: it.lbNom,
                nomVern: it.nomVern,
                rang: "ES",
                regne: null,
                classe: it.classe,
                ordre: null,
                famille: it.famille,
              })),
            };
            usedFilters = {
              regne: filters.regne, classe: filters.classe, ordre: filters.ordre,
              famille: filters.famille, groupe2Inpn: filters.groupe2Inpn,
              statutType: filters.statutType, statutCode: filters.statutCode,
              cdSig: filters.cdSig,
            };
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: JSON.stringify({
                source: result.sourceUsed,
                traitKey: result.traitKeyUsed,
                totalCount: result.totalCount,
                sample: result.items.slice(0, 12).map((it) => ({
                  cdNom: it.cdNom,
                  lbNom: it.lbNom,
                  nomVern: it.nomVern,
                  classe: it.classe,
                  famille: it.famille,
                  trait: result.traitKeyUsed
                    ? { label: it.traitLabel, value: it.traitValue, unit: it.traitUnit, raw: it.traitRaw }
                    : null,
                })),
              }),
            });
          }
        } else if (tu.name === "get_traits") {
          const parsed = getTraitsInputSchema.safeParse(tu.input ?? {});
          if (!parsed.success) {
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "cdNom invalide (entier positif requis).", is_error: true });
          } else {
            const cdNom = parsed.data.cdNom;
            const bundle = await getTraitsBundle(cdNom);
            if (!bundle) {
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Aucun taxon pour cdNom=${cdNom}`, is_error: true });
            } else if (bundle.bySource.length === 0) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify({
                  cdNom: bundle.cdNom,
                  lbNom: bundle.lbNom,
                  nomVern: bundle.nomVern,
                  bySource: [],
                  note: "Aucun trait PanTHERIA / AVONET / AmphiBIO disponible pour ce taxon.",
                }),
              });
            } else {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify(bundle),
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
