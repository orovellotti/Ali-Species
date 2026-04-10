import { Router, type IRouter } from "express";
import healthRouter from "./health";
import taxonsRouter from "./taxons";

const router: IRouter = Router();

router.use(healthRouter);
router.use(taxonsRouter);

export default router;
