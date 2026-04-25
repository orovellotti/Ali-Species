import { Router, type IRouter } from "express";
import healthRouter from "./health";
import taxonsRouter from "./taxons";
import mcpRouter from "./mcp";
import askRouter from "./ask";
import interactionsRouter from "./interactions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mcpRouter);
router.use(askRouter);
router.use(interactionsRouter);
router.use(taxonsRouter);

export default router;
