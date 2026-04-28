import { Router, type IRouter, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { sql, eq, and, ilike, or, desc } from "drizzle-orm";
import { db, taxonsTable, bdcStatutsTable } from "@workspace/db";
import { getInteractionsForCdNom } from "./interactions.js";
import { runStatusBreakdown } from "../lib/breakdown.js";

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "ali-species-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "search_taxons",
    {
      title: "Rechercher des taxons",
      description:
        "Recherche dans le referentiel TAXREF v18 (faune, flore, champignons de France). Retourne les taxons correspondants avec leur cdNom (identifiant), nom scientifique, nom vernaculaire, rang et regne.",
      inputSchema: {
        query: z.string().min(2).describe("Nom scientifique ou vernaculaire (au moins 2 caracteres)"),
        regne: z.enum(["Animalia", "Plantae", "Fungi", "Chromista", "Bacteria", "Archaea", "Protozoa"]).optional().describe("Filtrer par regne"),
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
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    },
  );

  server.registerTool(
    "get_taxon",
    {
      title: "Detail d'un taxon",
      description: "Retourne toutes les informations d'un taxon a partir de son cdNom (identifiant TAXREF).",
      inputSchema: { cdNom: z.number().int().describe("Identifiant TAXREF (cdNom)") },
    },
    async ({ cdNom }) => {
      const [taxon] = await db.select().from(taxonsTable).where(eq(taxonsTable.cdNom, cdNom));
      if (!taxon) return { isError: true, content: [{ type: "text", text: `Aucun taxon trouve pour cdNom=${cdNom}` }] };
      return { content: [{ type: "text", text: JSON.stringify(taxon, null, 2) }] };
    },
  );

  server.registerTool(
    "get_classification",
    {
      title: "Classification taxonomique",
      description: "Retourne la classification complete (regne, embranchement, classe, ordre, famille, genre, espece) pour un cdNom.",
      inputSchema: { cdNom: z.number().int() },
    },
    async ({ cdNom }) => {
      const [t] = await db.select({
        regne: taxonsTable.regne,
        phylum: taxonsTable.phylum,
        classe: taxonsTable.classe,
        ordre: taxonsTable.ordre,
        famille: taxonsTable.famille,
        sousFamille: taxonsTable.sousFamille,
        tribu: taxonsTable.tribu,
        genre: taxonsTable.genre,
        lbNom: taxonsTable.lbNom,
        rang: taxonsTable.rang,
      }).from(taxonsTable).where(eq(taxonsTable.cdNom, cdNom));
      if (!t) return { isError: true, content: [{ type: "text", text: `Aucun taxon trouve pour cdNom=${cdNom}` }] };
      return { content: [{ type: "text", text: JSON.stringify(t, null, 2) }] };
    },
  );

  server.registerTool(
    "get_statuts",
    {
      title: "Statuts de conservation",
      description: "Retourne les statuts BDC (listes rouges, protections reglementaires, directives, conventions) d'un taxon.",
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
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    },
  );

  server.registerTool(
    "status_breakdown",
    {
      title: "Répartition par statut",
      description:
        "Retourne la ventilation des taxons par code de statut, pour un type de statut donné (ex: répartition Liste Rouge nationale par catégorie UICN, ou des protégées par annexe). Filtres taxonomiques optionnels (regne, classe, ordre, famille, genre, groupe2Inpn) et territoire (cdSig).",
      inputSchema: {
        statutType: z.string().describe("Code du type de statut: LRM, LRE, LRN, LRR, PN, PR, PD, POM, DH, DO, BERN, BONN, BARC, OSPAR, ZDET, PNA, exPNA, SENSNAT, SENSREG, SENSDEP, REGL, REGLII, REGLLUTTE, REGLSO."),
        regne: z.string().optional().describe("Animalia, Plantae, Fungi..."),
        classe: z.string().optional().describe("Mammalia, Aves, Insecta..."),
        ordre: z.string().optional(),
        famille: z.string().optional(),
        genre: z.string().optional(),
        groupe2Inpn: z.string().optional().describe("Mammifères, Oiseaux, Reptiles..."),
        cdSig: z.string().optional().describe("Code SIG du territoire (ex: METRO, 11, 75)."),
      },
    },
    async (input) => {
      const { totalCount, breakdown } = await runStatusBreakdown(input);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { statutType: input.statutType, totalTaxons: totalCount, breakdown },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

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
      if (!payload) return { isError: true, content: [{ type: "text", text: `Aucun taxon trouvé pour cdNom=${cdNom}` }] };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
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
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  }
}

router.post("/mcp", handleMcp);
router.get("/mcp", handleMcp);
router.delete("/mcp", handleMcp);

export default router;
