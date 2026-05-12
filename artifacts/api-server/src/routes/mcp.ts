import { Router, type IRouter, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { sql, eq, and, ilike, or, desc, asc, ne, type SQL } from "drizzle-orm";
import { db, taxonsTable, bdcStatutsTable } from "@workspace/db";
import { getInteractionsForCdNom } from "./interactions.js";
import { getTraitsForCdNom } from "./taxons.js";
import { runStatusBreakdown } from "../lib/breakdown.js";
import { runQuery } from "../lib/query.js";
import { runTraitQuery, TRAIT_KEYS } from "../lib/traitsQuery.js";

const SPARQL_UPSTREAM = process.env.OXIGRAPH_HTTP ?? "http://127.0.0.1:9000";

interface DbRows<T> { rows?: T[] }
function rowsOf<T>(res: unknown): T[] {
  const r = res as DbRows<T> | T[];
  if (Array.isArray(r)) return r;
  return r.rows ?? [];
}

const REGNE_ENUM = z.enum([
  "Animalia", "Plantae", "Fungi", "Chromista",
  "Bacteria", "Archaea", "Protozoa",
]);

function toJson(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function notFound(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "ali-species-mcp", version: "1.3.0" },
    { capabilities: { tools: {} } },
  );

  // ─────────────────────────────────────────────────────────────────
  // Recherche & lecture de taxons
  // ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "search_taxons",
    {
      title: "Rechercher des taxons (recherche simple)",
      description:
        "Recherche rapide par nom dans TAXREF v18. Pour les recherches complexes (filtres taxonomiques + statuts + territoire), utilise plutôt query_taxa.",
      inputSchema: {
        query: z.string().min(2).describe("Nom scientifique ou vernaculaire (au moins 2 caractères)"),
        regne: REGNE_ENUM.optional(),
        limit: z.number().int().min(1).max(50).default(20).optional(),
      },
    },
    async ({ query, regne, limit }) => {
      const pattern = `%${query}%`;
      const lim = Math.min(Math.max(limit ?? 20, 1), 50);
      const filters = [or(ilike(taxonsTable.lbNom, pattern), ilike(taxonsTable.nomVern, pattern))];
      if (regne) filters.push(eq(taxonsTable.regne, regne));
      const rows = await db
        .select({
          cdNom: taxonsTable.cdNom,
          cdRef: taxonsTable.cdRef,
          lbNom: taxonsTable.lbNom,
          nomVern: taxonsTable.nomVern,
          rang: taxonsTable.rang,
          famille: taxonsTable.famille,
          regne: taxonsTable.regne,
        })
        .from(taxonsTable)
        .where(and(...filters))
        .orderBy(desc(sql`CASE WHEN ${taxonsTable.lbNom} ILIKE ${query + "%"} THEN 1 ELSE 0 END`))
        .limit(lim);
      return toJson(rows);
    },
  );

  server.registerTool(
    "query_taxa",
    {
      title: "Recherche avancée de taxons",
      description:
        "Recherche puissante dans TAXREF v18 combinant filtres taxonomiques (règne, classe, ordre, famille, genre…), statuts de conservation (Liste Rouge UICN, protections, directives…), territoire (région ou département) et habitat. Retourne le nombre total de résultats et un échantillon.",
      inputSchema: {
        name: z.string().optional().describe("Nom scientifique ou vernaculaire (recherche partielle, insensible à la casse)."),
        regne: z.string().optional().describe("Animalia, Plantae, Fungi, Bacteria, Chromista, Protozoa, Archaea."),
        phylum: z.string().optional().describe("Embranchement (Chordata, Arthropoda, Mollusca, Tracheophyta…)."),
        classe: z.string().optional().describe("Mammalia, Aves, Reptilia, Amphibia, Insecta, Magnoliopsida…"),
        ordre: z.string().optional(),
        famille: z.string().optional(),
        genre: z.string().optional(),
        rang: z.string().optional().describe("Rang TAXREF (ES = espèce par défaut, GN, FM, OR, CL, PH, KD, SSES…)."),
        statutType: z.string().optional().describe("Type de statut : LRM, LRE, LRN, LRR, PN, PR, PD, POM, DH, DO, BERN, BONN, BARC, OSPAR, ZDET, PNA, exPNA, SENSNAT, SENSREG, SENSDEP, REGL, REGLII, REGLLUTTE, REGLSO. Voir list_status_types pour la liste complète."),
        statutCode: z.string().optional().describe("Code du statut (CR, EN, VU, NT, LC, DD, NA pour les listes rouges ; II, IV pour DH ; A2, A3 pour Berne…)."),
        cdSig: z.string().optional().describe("Code SIG du territoire : METRO (France métropolitaine), 11 (Île-de-France), 75 (Paris)… Voir list_territoires."),
        groupe2Inpn: z.string().optional().describe("Grand groupe vernaculaire INPN (Mammifères, Oiseaux, Reptiles, Amphibiens, Poissons, Insectes, Plantes à fleurs…)."),
        habitat: z.string().optional().describe("Code habitat : 1=marin, 2=eau douce, 3=terrestre, 4=marin/eau douce, 5=marin/terrestre, 6=eau douce/terrestre, 7=marin/eau douce/terrestre, 8=continental."),
        limit: z.number().int().min(1).max(30).optional().describe("Nombre d'exemples à renvoyer (défaut 12, max 30)."),
      },
    },
    async (input) => {
      const { totalCount, items } = await runQuery(input);
      return toJson({ totalCount, items });
    },
  );

  server.registerTool(
    "get_taxon",
    {
      title: "Détail d'un taxon",
      description: "Retourne toutes les informations d'un taxon à partir de son cdNom (identifiant TAXREF).",
      inputSchema: { cdNom: z.number().int().describe("Identifiant TAXREF (cdNom)") },
    },
    async ({ cdNom }) => {
      const [taxon] = await db.select().from(taxonsTable).where(eq(taxonsTable.cdNom, cdNom));
      if (!taxon) return notFound(`Aucun taxon trouvé pour cdNom=${cdNom}`);
      return toJson(taxon);
    },
  );

  server.registerTool(
    "get_classification",
    {
      title: "Classification taxonomique",
      description: "Retourne la classification (règne, embranchement, classe, ordre, famille) d'un cdNom, ainsi que ses grands groupes vernaculaires INPN et son nom valide.",
      inputSchema: { cdNom: z.number().int() },
    },
    async ({ cdNom }) => {
      const [t] = await db.select({
        regne: taxonsTable.regne,
        phylum: taxonsTable.phylum,
        classe: taxonsTable.classe,
        ordre: taxonsTable.ordre,
        famille: taxonsTable.famille,
        group1Inpn: taxonsTable.group1Inpn,
        group2Inpn: taxonsTable.group2Inpn,
        lbNom: taxonsTable.lbNom,
        nomValide: taxonsTable.nomValide,
        rang: taxonsTable.rang,
      }).from(taxonsTable).where(eq(taxonsTable.cdNom, cdNom));
      if (!t) return notFound(`Aucun taxon trouvé pour cdNom=${cdNom}`);
      return toJson(t);
    },
  );

  server.registerTool(
    "get_children",
    {
      title: "Sous-taxons directs",
      description: "Retourne les taxons enfants directs d'un taxon (par exemple, les espèces d'un genre, les genres d'une famille…). Utile pour explorer une branche de la taxonomie.",
      inputSchema: {
        cdNom: z.number().int().describe("cdNom du taxon parent"),
        limit: z.number().int().min(1).max(500).default(100).optional(),
      },
    },
    async ({ cdNom, limit }) => {
      const lim = Math.min(Math.max(limit ?? 100, 1), 500);
      const children = await db
        .select({
          cdNom: taxonsTable.cdNom,
          lbNom: taxonsTable.lbNom,
          nomVern: taxonsTable.nomVern,
          rang: taxonsTable.rang,
          famille: taxonsTable.famille,
        })
        .from(taxonsTable)
        .where(eq(taxonsTable.cdSup, cdNom))
        .orderBy(asc(taxonsTable.lbNom))
        .limit(lim);
      return toJson({ count: children.length, children });
    },
  );

  server.registerTool(
    "get_random_species",
    {
      title: "Espèce aléatoire",
      description: "Retourne une espèce tirée au hasard parmi celles ayant un nom vernaculaire français. Utile pour proposer une découverte.",
      inputSchema: {},
    },
    async () => {
      const [taxon] = await db
        .select({
          cdNom: taxonsTable.cdNom,
          lbNom: taxonsTable.lbNom,
          nomVern: taxonsTable.nomVern,
          rang: taxonsTable.rang,
          regne: taxonsTable.regne,
        })
        .from(taxonsTable)
        .where(and(
          eq(taxonsTable.cdNom, taxonsTable.cdRef),
          eq(taxonsTable.rang, "ES"),
          sql`${taxonsTable.nomVern} IS NOT NULL AND ${taxonsTable.nomVern} != ''`
        ))
        .orderBy(sql`RANDOM()`)
        .limit(1);
      if (!taxon) return notFound("Aucune espèce trouvée");
      return toJson(taxon);
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // Statuts de conservation
  // ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "get_statuts",
    {
      title: "Statuts de conservation d'un taxon",
      description: "Retourne les statuts BdC (listes rouges, protections réglementaires, directives, conventions) d'un taxon.",
      inputSchema: { cdNom: z.number().int() },
    },
    async ({ cdNom }) => {
      const rows = await db
        .select({
          cdTypeStatut: bdcStatutsTable.cdTypeStatut,
          lbTypeStatut: bdcStatutsTable.lbTypeStatut,
          regroupementType: bdcStatutsTable.regroupementType,
          codeStatut: bdcStatutsTable.codeStatut,
          labelStatut: bdcStatutsTable.labelStatut,
          lbAdmTr: bdcStatutsTable.lbAdmTr,
          fullCitation: bdcStatutsTable.fullCitation,
          docUrl: bdcStatutsTable.docUrl,
        })
        .from(bdcStatutsTable)
        .where(eq(bdcStatutsTable.cdNom, cdNom));
      return toJson(rows);
    },
  );

  server.registerTool(
    "status_breakdown",
    {
      title: "Répartition par statut",
      description:
        "Retourne la ventilation des taxons par code de statut, pour un type de statut donné (ex: répartition Liste Rouge nationale par catégorie UICN). Filtres taxonomiques (règne, classe, ordre, famille, genre, groupe2Inpn) et territoire (cdSig) optionnels.",
      inputSchema: {
        statutType: z.string().describe("Code du type de statut : LRM, LRE, LRN, LRR, PN, PR, PD, POM, DH, DO, BERN, BONN, BARC, OSPAR, ZDET, PNA, exPNA, SENSNAT, SENSREG, SENSDEP, REGL, REGLII, REGLLUTTE, REGLSO."),
        regne: z.string().optional(),
        classe: z.string().optional(),
        ordre: z.string().optional(),
        famille: z.string().optional(),
        genre: z.string().optional(),
        groupe2Inpn: z.string().optional(),
        cdSig: z.string().optional(),
      },
    },
    async (input) => {
      const { totalCount, breakdown } = await runStatusBreakdown(input);
      return toJson({ statutType: input.statutType, totalTaxons: totalCount, breakdown });
    },
  );

  server.registerTool(
    "list_status_types",
    {
      title: "Liste des types de statuts disponibles",
      description: "Retourne tous les codes de type de statut (LRM, LRN, PN, DH, etc.) avec leur libellé, leur regroupement (Listes rouges, Protections, Directives, Conventions internationales…) et le nombre de taxons concernés. À utiliser pour découvrir les statuts disponibles avant d'appeler query_taxa ou status_breakdown.",
      inputSchema: {},
    },
    async () => {
      const rows = await db.execute(sql`
        SELECT
          cd_type_statut AS code,
          MAX(lb_type_statut) AS label,
          MAX(regroupement_type) AS "regroupementType",
          COUNT(DISTINCT cd_nom)::int AS taxa
        FROM bdc_statuts
        WHERE cd_type_statut IS NOT NULL AND lb_type_statut IS NOT NULL
        GROUP BY cd_type_statut
        ORDER BY MAX(regroupement_type), cd_type_statut
      `);
      const items = ((rows as { rows?: unknown[] }).rows ?? rows);
      return toJson(items);
    },
  );

  server.registerTool(
    "list_territoires",
    {
      title: "Liste des territoires (régions et départements)",
      description: "Retourne la liste des territoires utilisables comme cdSig dans les filtres : régions et départements de France (métropole + outre-mer), avec leur libellé et le nombre de taxons qui y sont rattachés.",
      inputSchema: {
        niveau: z.enum(["Région", "Département"]).optional().describe("Filtrer par niveau administratif"),
      },
    },
    async ({ niveau }) => {
      const niveauFilter = niveau ? sql`AND niveau_admin = ${niveau}` : sql``;
      const rows = await db.execute(sql`
        SELECT lb_adm_tr AS lb, cd_sig, niveau_admin AS niveau, COUNT(DISTINCT cd_nom)::int AS taxa
        FROM bdc_statuts
        WHERE niveau_admin IN ('Région', 'Département')
          AND cd_sig IS NOT NULL
          AND lb_adm_tr IS NOT NULL
          ${niveauFilter}
        GROUP BY 1, 2, 3
        ORDER BY niveau_admin, lb_adm_tr
      `);
      const items = ((rows as { rows?: unknown[] }).rows ?? rows);
      return toJson(items);
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // Enrichissements externes
  // ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "get_interactions",
    {
      title: "Réseau trophique (GloBI)",
      description:
        "Retourne les interactions biotiques d'un taxon depuis Global Biotic Interactions (GloBI) : ce qu'il consomme, ce qui le consomme, parasites/hôtes, pollinisation. Les partenaires connus de TAXREF incluent leur cdNom et nom vernaculaire français.",
      inputSchema: { cdNom: z.number().int().describe("Identifiant TAXREF (cdNom)") },
    },
    async ({ cdNom }) => {
      const payload = await getInteractionsForCdNom(cdNom);
      if (!payload) return notFound(`Aucun taxon trouvé pour cdNom=${cdNom}`);
      return toJson(payload);
    },
  );

  server.registerTool(
    "get_wikipedia",
    {
      title: "Résumé Wikipedia",
      description: "Retourne le résumé Wikipedia (FR avec repli EN) d'un taxon, plus l'URL de la page complète. Pratique pour donner une description grand public.",
      inputSchema: { cdNom: z.number().int() },
    },
    async ({ cdNom }) => {
      const [taxon] = await db
        .select({ lbNom: taxonsTable.lbNom, nomValide: taxonsTable.nomValide })
        .from(taxonsTable)
        .where(eq(taxonsTable.cdNom, cdNom));
      if (!taxon) return notFound(`Aucun taxon trouvé pour cdNom=${cdNom}`);

      const searchName = taxon.nomValide?.split(" ").slice(0, 2).join(" ") || taxon.lbNom;

      async function fetchSummary(lang: "fr" | "en") {
        try {
          const r = await fetch(
            `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`,
            { headers: { "User-Agent": "AliSpecies-MCP/1.0" } },
          );
          if (!r.ok) return null;
          const data = (await r.json()) as {
            extract?: string;
            content_urls?: { desktop?: { page?: string } };
            title?: string;
            type?: string;
          };
          if (data.type === "disambiguation" || !data.extract) return null;
          return {
            lang,
            title: data.title ?? null,
            extract: data.extract,
            url: data.content_urls?.desktop?.page ?? null,
          };
        } catch {
          return null;
        }
      }

      const summary = (await fetchSummary("fr")) ?? (await fetchSummary("en"));
      if (!summary) return toJson({ extract: null, url: null, title: null, lang: null });
      return toJson(summary);
    },
  );

  server.registerTool(
    "get_traits",
    {
      title: "Traits biologiques (Wikidata + datasets cachés)",
      description:
        "Retourne les traits biologiques d'un taxon : (a) traits agrégés depuis Wikidata (masse, longueur, longévité, gestation, incubation, taille de portée…) avec QID et identifiants externes (iNaturalist, GBIF, EOL, NCBI, ITIS, COL, WoRMS, MSW, POWO, IPNI, WFO, BHL), (b) blocs de traits issus de bases scientifiques cachées en DB selon la classe : PanTHERIA pour les mammifères (~18 traits : domaine vital, cycle d'activité, masse adulte, longévité, gestation, sevrage, régime alimentaire…), AVONET pour les oiseaux (~17 traits : morphométrie du bec, distance de Kipp, indice main-aile, mode de vie, niche trophique, comportement migratoire…), AmphiBIO pour les amphibiens (~14 traits : habitat, régime, mode de reproduction, taille de ponte, maturité…). Le champ `wikidataAvailable` indique si Wikidata a répondu ; en cas d'indisponibilité, `staticSources[]` reste peuplé. Chaque source statique fournit son éditeur, sa licence et sa citation formelle.",
      inputSchema: { cdNom: z.number().int().describe("Identifiant TAXREF (cdNom)") },
    },
    async ({ cdNom }) => {
      const payload = await getTraitsForCdNom(cdNom);
      if (!payload) return notFound(`Aucun taxon trouvé pour cdNom=${cdNom}`);
      return toJson(payload);
    },
  );

  server.registerTool(
    "get_gbif",
    {
      title: "Données GBIF (occurrences mondiales et UICN mondial)",
      description: "Retourne les données GBIF d'un taxon : clé GBIF, nombre d'occurrences mondiales, statut UICN mondial (catégorie + libellé) et URL de la fiche GBIF. Complète utilement les statuts français de la BdC.",
      inputSchema: { cdNom: z.number().int() },
    },
    async ({ cdNom }) => {
      const [taxon] = await db
        .select({ lbNom: taxonsTable.lbNom, nomValide: taxonsTable.nomValide, regne: taxonsTable.regne })
        .from(taxonsTable)
        .where(eq(taxonsTable.cdNom, cdNom));
      if (!taxon) return notFound(`Aucun taxon trouvé pour cdNom=${cdNom}`);

      const searchName = taxon.nomValide?.split(" ").slice(0, 2).join(" ") || taxon.lbNom;
      try {
        const matchUrl = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(searchName)}${taxon.regne ? `&kingdom=${encodeURIComponent(taxon.regne)}` : ""}`;
        const matchRes = await fetch(matchUrl);
        if (!matchRes.ok) return toJson({ gbifKey: null });

        const match = (await matchRes.json()) as { usageKey?: number; matchType?: string };
        if (!match.usageKey || match.matchType === "NONE") {
          return toJson({ gbifKey: null });
        }

        const [occRes, iucnRes] = await Promise.all([
          fetch(`https://api.gbif.org/v1/occurrence/search?taxonKey=${match.usageKey}&limit=0`),
          fetch(`https://api.gbif.org/v1/species/${match.usageKey}/iucnRedListCategory`),
        ]);

        const occurrenceCount = occRes.ok
          ? ((await occRes.json()) as { count?: number }).count ?? null
          : null;
        const iucn = iucnRes.ok
          ? ((await iucnRes.json()) as { category?: string })
          : null;

        return toJson({
          gbifKey: match.usageKey,
          gbifUrl: `https://www.gbif.org/species/${match.usageKey}`,
          occurrenceCount,
          iucnCategory: iucn?.category ?? null,
        });
      } catch {
        return toJson({ gbifKey: null, error: "GBIF unreachable" });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // Navigation taxonomique additionnelle
  // ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "get_parent",
    {
      title: "Taxon parent direct",
      description:
        "Retourne le taxon parent direct (cdSup) d'un taxon donné. Utile pour remonter d'une espèce vers son genre, d'un genre vers sa famille, etc.",
      inputSchema: { cdNom: z.number().int().describe("cdNom du taxon enfant") },
    },
    async ({ cdNom }) => {
      const [child] = await db
        .select({ cdSup: taxonsTable.cdSup, lbNom: taxonsTable.lbNom })
        .from(taxonsTable)
        .where(eq(taxonsTable.cdNom, cdNom));
      if (!child) return notFound(`Aucun taxon trouvé pour cdNom=${cdNom}`);
      if (!child.cdSup) return toJson({ parent: null, note: `${child.lbNom} n'a pas de parent (taxon racine).` });
      const [parent] = await db
        .select({
          cdNom: taxonsTable.cdNom,
          lbNom: taxonsTable.lbNom,
          nomVern: taxonsTable.nomVern,
          rang: taxonsTable.rang,
          regne: taxonsTable.regne,
          classe: taxonsTable.classe,
          famille: taxonsTable.famille,
        })
        .from(taxonsTable)
        .where(eq(taxonsTable.cdNom, child.cdSup));
      return toJson({ parent: parent ?? null });
    },
  );

  server.registerTool(
    "get_synonyms",
    {
      title: "Synonymes d'un taxon",
      description:
        "Retourne tous les synonymes (autres dénominations TAXREF) du taxon valide associé à ce cdNom. Très utile pour comprendre l'historique nomenclatural d'une espèce. Le taxon de référence (cdRef) est exclu de la liste.",
      inputSchema: { cdNom: z.number().int() },
    },
    async ({ cdNom }) => {
      const [t] = await db
        .select({ cdRef: taxonsTable.cdRef, lbNom: taxonsTable.lbNom, nomValide: taxonsTable.nomValide })
        .from(taxonsTable)
        .where(eq(taxonsTable.cdNom, cdNom));
      if (!t) return notFound(`Aucun taxon trouvé pour cdNom=${cdNom}`);
      const synonyms = await db
        .select({
          cdNom: taxonsTable.cdNom,
          lbNom: taxonsTable.lbNom,
          lbAuteur: taxonsTable.lbAuteur,
          nomComplet: taxonsTable.nomComplet,
          rang: taxonsTable.rang,
        })
        .from(taxonsTable)
        .where(and(eq(taxonsTable.cdRef, t.cdRef), ne(taxonsTable.cdNom, t.cdRef)))
        .orderBy(asc(taxonsTable.lbNom));
      return toJson({
        cdRef: t.cdRef,
        nomValide: t.nomValide,
        synonymsCount: synonyms.length,
        synonyms,
      });
    },
  );

  server.registerTool(
    "list_taxonomic_facets",
    {
      title: "Lister les valeurs distinctes d'un rang taxonomique",
      description:
        "Liste les valeurs possibles d'un rang taxonomique (regne, phylum, classe, ordre, famille, groupe2Inpn) avec le nombre d'espèces associées. Filtres parents optionnels (par exemple : famille=Felidae,classe=Mammalia donne uniquement les genres de cette famille). Idéal pour proposer un autocomplete avant d'appeler query_taxa.",
      inputSchema: {
        facet: z.enum(["regne", "phylum", "classe", "ordre", "famille", "groupe2Inpn"])
          .describe("Rang/colonne dont on veut lister les valeurs distinctes"),
        regne: z.string().optional(),
        classe: z.string().optional(),
        ordre: z.string().optional(),
        famille: z.string().optional(),
        rang: z.string().optional().describe("Restreindre le décompte à un rang (par défaut ES = espèces)"),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async ({ facet, regne, classe, ordre, famille, rang, limit }) => {
      const colMap: Record<string, string> = {
        regne: "regne", phylum: "phylum", classe: "classe", ordre: "ordre",
        famille: "famille", groupe2Inpn: "group2_inpn",
      };
      const col = colMap[facet];
      const rangValue = rang ?? "ES";
      const conds: SQL[] = [
        sql`${sql.raw(col)} IS NOT NULL`,
        sql`${sql.raw(col)} != ''`,
        sql`rang = ${rangValue}`,
        sql`cd_nom = cd_ref`,
      ];
      if (regne) conds.push(sql`regne = ${regne}`);
      if (classe) conds.push(sql`classe = ${classe}`);
      if (ordre) conds.push(sql`ordre = ${ordre}`);
      if (famille) conds.push(sql`famille = ${famille}`);
      const lim = Math.min(Math.max(limit ?? 200, 1), 500);
      const rows = await db.execute(sql`
        SELECT ${sql.raw(col)} AS value, COUNT(*)::int AS taxa
        FROM taxons
        WHERE ${sql.join(conds, sql` AND `)}
        GROUP BY 1
        ORDER BY 2 DESC, 1 ASC
        LIMIT ${lim}
      `);
      return toJson({ facet, rang: rangValue, items: rowsOf<{ value: string; taxa: number }>(rows) });
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // Statistiques & traits
  // ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "get_global_stats",
    {
      title: "Statistiques globales du graphe",
      description:
        "Vue d'ensemble du graphe ALI Species : nombre total de fiches TAXREF, espèces / genres / familles distincts, répartition par règne, et nombre total de lignes BdC Statuts. Utile pour planter le décor avant un échange.",
      inputSchema: {},
    },
    async () => {
      const overviewRes = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total_records,
          COUNT(DISTINCT cd_ref)::int AS distinct_taxa,
          COUNT(*) FILTER (WHERE rang = 'ES' AND cd_nom = cd_ref)::int AS species,
          COUNT(*) FILTER (WHERE rang = 'GN' AND cd_nom = cd_ref)::int AS genera,
          COUNT(*) FILTER (WHERE rang = 'FM' AND cd_nom = cd_ref)::int AS families
        FROM taxons
      `);
      const byRegneRes = await db.execute(sql`
        SELECT regne, COUNT(*) FILTER (WHERE rang = 'ES' AND cd_nom = cd_ref)::int AS species
        FROM taxons
        WHERE regne IS NOT NULL AND regne != ''
        GROUP BY regne
        ORDER BY species DESC
      `);
      const statutsRes = await db.execute(sql`SELECT COUNT(*)::int AS rows FROM bdc_statuts`);
      return toJson({
        overview: rowsOf<Record<string, number>>(overviewRes)[0] ?? null,
        speciesByRegne: rowsOf<{ regne: string; species: number }>(byRegneRes),
        bdcStatuts: rowsOf<{ rows: number }>(statutsRes)[0] ?? null,
      });
    },
  );

  server.registerTool(
    "query_traits",
    {
      title: "Recherche d'espèces par traits biologiques",
      description:
        "Recherche d'espèces dans les bases de traits scientifiques (PanTHERIA mammifères, AVONET oiseaux, AmphiBIO amphibiens). Permet de filtrer par valeur numérique (min/max), texte, et de croiser avec des filtres taxonomiques + statuts + territoire. Exemple : mammifères pesant plus de 100 kg → source=pantheria, traitKey=adultBodyMass, minValue=100000 (en grammes). Utiliser get_trait_keys pour découvrir les clés disponibles par source.",
      inputSchema: {
        source: z.enum(["pantheria", "avonet", "amphibio"])
          .describe("Base de traits : pantheria (mammifères), avonet (oiseaux), amphibio (amphibiens)"),
        traitKey: z.string().optional()
          .describe("Identifiant du trait (ex: adultBodyMass, mass, longevity). Voir get_trait_keys."),
        minValue: z.number().optional()
          .describe("Valeur numérique minimale (unité native du trait, voir get_trait_keys)"),
        maxValue: z.number().optional()
          .describe("Valeur numérique maximale"),
        valueContains: z.string().optional()
          .describe("Filtre texte sur la valeur formatée (utile pour les traits catégoriels)"),
        sortBy: z.enum(["value_asc", "value_desc", "name"]).optional()
          .describe("Tri : par valeur croissante/décroissante (nécessite traitKey numérique) ou par nom"),
        regne: z.string().optional(),
        classe: z.string().optional(),
        ordre: z.string().optional(),
        famille: z.string().optional(),
        groupe2Inpn: z.string().optional(),
        statutType: z.string().optional().describe("Croiser avec un statut (ex: PN, LRN)"),
        statutCode: z.string().optional().describe("Code du statut (ex: VU, EN, CR)"),
        cdSig: z.string().optional().describe("Code SIG d'un territoire"),
        limit: z.number().int().min(1).max(30).optional(),
      },
    },
    async (input) => {
      const result = await runTraitQuery(input);
      return toJson(result);
    },
  );

  server.registerTool(
    "get_trait_keys",
    {
      title: "Liste des clés de traits disponibles par source",
      description:
        "Retourne, pour chaque base de traits (PanTHERIA, AVONET, AmphiBIO), la liste des clés de traits disponibles (adultBodyMass, wingLen, longevity…). À appeler avant query_traits pour découvrir les filtres possibles.",
      inputSchema: {
        source: z.enum(["pantheria", "avonet", "amphibio"]).optional()
          .describe("Si fourni, ne retourne que les clés de cette source"),
      },
    },
    async ({ source }) => {
      if (source) return toJson({ source, keys: TRAIT_KEYS[source] });
      return toJson({
        pantheria: TRAIT_KEYS.pantheria,
        avonet: TRAIT_KEYS.avonet,
        amphibio: TRAIT_KEYS.amphibio,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // SPARQL (graphe RDF complet)
  // ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "run_sparql",
    {
      title: "Exécuter une requête SPARQL sur le graphe ALI Species",
      description:
        "Exécute une requête SPARQL 1.1 (SELECT, ASK, CONSTRUCT, DESCRIBE) contre le triplestore Oxigraph qui héberge l'intégralité du graphe RDF (TAXREF v18, BdC Statuts, traits, mappings Wikidata, interactions GloBI). Vocabulaires : Darwin Core, SKOS, OWL, Relations Ontology, DCTERMS. Préfixes URI : `https://ali-species.app/id/` (instances) et `https://ali-species.app/vocab/` (propriétés). Note : si le serveur Oxigraph n'est pas disponible (déploiement autoscale sans triplestore), un message clair est retourné — le dump RDF reste téléchargeable pour exécution locale.",
      inputSchema: {
        query: z.string().min(10).describe("Requête SPARQL complète (incluant les PREFIX nécessaires)"),
        format: z.enum(["json", "xml", "csv"]).optional().default("json")
          .describe("Format de réponse pour les SELECT/ASK (par défaut json)"),
      },
    },
    async ({ query, format }) => {
      const acceptMap: Record<string, string> = {
        json: "application/sparql-results+json",
        xml: "application/sparql-results+xml",
        csv: "text/csv",
      };
      const accept = acceptMap[format ?? "json"];
      try {
        const r = await fetch(`${SPARQL_UPSTREAM}/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/sparql-query",
            Accept: accept,
          },
          body: query,
        });
        if (!r.ok) {
          const txt = await r.text();
          return notFound(`SPARQL upstream ${r.status}: ${txt.slice(0, 800)}`);
        }
        if (format === "json" || !format) {
          const json = await r.json();
          return toJson(json);
        }
        const text = await r.text();
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return notFound(
          `Endpoint SPARQL indisponible (${(err as Error).message}). Le triplestore Oxigraph n'est pas démarré dans cet environnement (typique d'un déploiement autoscale). Le dump RDF complet reste téléchargeable depuis /api/exports/rdf.ttl.gz pour exécution SPARQL locale.`,
        );
      }
    },
  );

  return server;
}

const router: IRouter = Router();

async function handleMcp(req: Request, res: Response) {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  }
}

router.post("/mcp", handleMcp);
router.get("/mcp", handleMcp);
router.delete("/mcp", handleMcp);

export default router;
