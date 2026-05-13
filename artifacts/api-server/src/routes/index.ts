import express, { Router, type IRouter } from "express";
import healthRouter from "./health";
import taxonsRouter from "./taxons";
import mcpRouter from "./mcp";
import askRouter from "./ask";
import interactionsRouter from "./interactions";
import sparqlRouter from "./sparql";
import exportsRouter from "./exports";
import bhlRouter from "./bhl";
import sitemapRouter from "./sitemap";
import profileRouter from "./profile";
import shareRouter, { registerOgRoute } from "./share";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mcpRouter);
router.use(askRouter);
router.use(interactionsRouter);
// SPARQL endpoint accepts urlencoded forms and raw application/sparql-query bodies.
router.use("/sparql", express.urlencoded({ extended: false, limit: "1mb" }));
router.use("/sparql", express.text({ type: "application/sparql-query", limit: "1mb" }));
router.use(sparqlRouter);
router.use(exportsRouter);
router.use(bhlRouter);
router.use(sitemapRouter);
router.use(profileRouter);
registerOgRoute(router);
router.use(taxonsRouter);

export { shareRouter };
export default router;
