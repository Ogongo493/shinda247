import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameRouter from "./game";
import authRouter, { requireAuth } from "./auth";
import mpesaRouter from "./mpesa";
import adminRouter from "./admin";
import { requirePlayerRole } from "../middleware/roles";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);

// Player-only API boundaries. The role is re-read from the database for every request,
// so an admin cannot use a stale player JWT against betting or wallet endpoints.
router.use("/game/bet", requireAuth, requirePlayerRole);
router.use("/game/cashout", requireAuth, requirePlayerRole);
router.use("/wallet", requireAuth, requirePlayerRole);
router.use("/notifications", requireAuth, requirePlayerRole);
router.use("/mpesa/deposit", requireAuth, requirePlayerRole);
router.use("/mpesa/withdraw", requireAuth, requirePlayerRole);

router.use("/mpesa", mpesaRouter);
router.use("/admin", adminRouter);
router.use(gameRouter);

export default router;
