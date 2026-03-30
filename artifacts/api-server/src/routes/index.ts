import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameRouter from "./game";
import authRouter from "./auth";
import mpesaRouter from "./mpesa";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/mpesa", mpesaRouter);
router.use("/admin", adminRouter);
router.use(gameRouter);

export default router;
