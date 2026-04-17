import { Router, type IRouter } from "express";
import healthRouter from "./health";
import taxonsRouter from "./taxons";
import mcpRouter from "./mcp";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mcpRouter);
router.use(taxonsRouter);

export default router;
