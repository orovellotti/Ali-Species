import { Router, type IRouter, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { sql, eq, and, ilike, or, desc, asc } from "drizzle-orm";
import { db, taxonsTable, bdcStatutsTable } from "@workspace/db";
import { getInteractionsForCdNom } from "./interactions.js";
import { runStatusBreakdown } from "../lib/breakdown.js";
import { runQuery } from "../lib/query.js";

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
    { name: "ali-species-mcp", version: "1.1.0" },
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
