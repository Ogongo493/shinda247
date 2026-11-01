import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users, wallets, transactions, games, bets, houseReserve, houseReserveEntries, gameControl } from "@workspace/db";
import { eq, desc, sql, count, sum } from "drizzle-orm";
import { requireAuth } from "./auth";
import type { JwtPayload } from "../lib/jwt";
import { setGamePaused } from "../lib/gameEngine";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response, next: any): Promise<void> {
  try {
    const user = (req as any).user as JwtPayload;
    if (!user?.sub) { res.status(403).json({ error: "Admin access required" }); return; }
    const [account] = await db.select({ isAdmin: users.isAdmin, isActive: users.isActive })
      .from(users).where(eq(users.id, user.sub));
    if (!account?.isAdmin || !account.isActive) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch (error) { next(error); }
}

router.get("/stats", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const [playerCount] = await db.select({ count: count() }).from(users).where(eq(users.accountType, "player"));
  const [gameCount] = await db.select({ count: count() }).from(games);
  const [totalDeposited] = await db
    .select({ total: sum(wallets.totalDeposited) })
    .from(wallets);
  const [totalWithdrawn] = await db
    .select({ total: sum(wallets.totalWithdrawn) })
    .from(wallets);
  const [totalBalance] = await db
    .select({ total: sum(wallets.balanceCents) })
    .from(wallets);
  const [betCount] = await db.select({ count: count() }).from(bets);

  res.json({
    players: playerCount.count,
    games: gameCount.count,
    totalDepositedKes: Math.round((Number(totalDeposited.total) || 0) / 100),
    totalWithdrawnKes: Math.round((Number(totalWithdrawn.total) || 0) / 100),
    totalBalanceKes: Math.round((Number(totalBalance.total) || 0) / 100),
    totalBets: betCount.count,
  });
});

router.get("/players", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1"));
  const limit = 50;
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: users.id,
      phone: users.phone,
      username: users.username,
      isActive: users.isActive,
      isAdmin: users.isAdmin,
      kycVerified: users.kycVerified,
      createdAt: users.createdAt,
      balanceCents: wallets.balanceCents,
      totalDeposited: wallets.totalDeposited,
      totalWithdrawn: wallets.totalWithdrawn,
    })
    .from(users)
    .leftJoin(wallets, eq(users.id, wallets.userId))
    .where(eq(users.accountType, "player"))
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows.map(r => ({
    ...r,
    balanceKes: Math.round((r.balanceCents || 0) / 100),
    totalDepositedKes: Math.round((Number(r.totalDeposited) || 0) / 100),
    totalWithdrawnKes: Math.round((Number(r.totalWithdrawn) || 0) / 100),
  })));
});

router.get("/transactions", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1"));
  const limit = 50;
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: transactions.id,
      userId: transactions.userId,
      username: users.username,
      phone: users.phone,
      type: transactions.type,
      status: transactions.status,
      amountCents: transactions.amountCents,
      mpesaRef: transactions.mpesaRef,
      mpesaPhone: transactions.mpesaPhone,
      description: transactions.description,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.userId, users.id))
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows.map(r => ({
    ...r,
    amountKes: Math.round((Number(r.amountCents) || 0) / 100),
  })));
});

router.get("/games", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1"));
  const limit = 50;
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(games)
    .orderBy(desc(games.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows.map(r => ({
    ...r,
    crashPointMultiplier: r.crashPoint ? r.crashPoint / 100 : null,
    totalBetsKes: Math.round((Number(r.totalBetsCents) || 0) / 100),
    totalPayoutKes: Math.round((Number(r.totalPayoutCents) || 0) / 100),
  })));
});

router.patch("/players/:id/toggle-active", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const userId = parseInt(String(req.params.id));
  const [user] = await db.select({ isActive: users.isActive, accountType: users.accountType }).from(users).where(eq(users.id, userId));
  if (!user || user.accountType !== "player") { res.status(404).json({ error: "Player not found" }); return; }
  const [updated] = await db
    .update(users)
    .set({ isActive: !user.isActive })
    .where(eq(users.id, userId))
    .returning({ id: users.id, isActive: users.isActive });
  res.json(updated);
});

router.patch("/players/:id/toggle-admin", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  res.status(403).json({ error: "Administrator roles can only be changed through the controlled account-provisioning process." });
});


router.get("/house-reserve", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const [reserve] = await db.select().from(houseReserve).where(eq(houseReserve.id, 1));
  if (!reserve) { res.status(503).json({ error: "House reserve is not initialized" }); return; }
  res.json({
    balanceKes: reserve.balanceCents / 100,
    reservedKes: reserve.reservedCents / 100,
    availableKes: (reserve.balanceCents - reserve.reservedCents) / 100,
    currency: reserve.currency,
    riskRate: 0.05,
    maxAllowedPayoutKes: Math.floor(reserve.balanceCents * 0.05) / 100,
    updatedAt: reserve.updatedAt.toISOString(),
  });
});

router.post("/house-reserve/adjust", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload;
  const action = req.body?.action;
  const amountKes = Number(req.body?.amountKes);
  const description = typeof req.body?.description === "string"
    ? req.body.description.trim().slice(0, 250) : "";

  if ((action !== "deposit" && action !== "withdraw") ||
      !Number.isFinite(amountKes) || amountKes <= 0 ||
      !Number.isSafeInteger(Math.round(amountKes * 100))) {
    res.status(400).json({ error: "Provide action deposit/withdraw and a positive amountKes." });
    return;
  }

  const amountCents = Math.round(amountKes * 100);
  try {
    const result = await db.transaction(async (tx) => {
      const [reserve] = await tx.select().from(houseReserve)
        .where(eq(houseReserve.id, 1)).for("update");
      if (!reserve) throw new Error("House reserve is not initialized");

      const balanceBefore = reserve.balanceCents;
      const balanceAfter = action === "deposit"
        ? balanceBefore + amountCents
        : balanceBefore - amountCents;
      const availableCents = balanceBefore - reserve.reservedCents;
      if (action === "withdraw" && amountCents > availableCents) {
        throw new Error("Withdrawal exceeds the unreserved house reserve balance.");
      }
      if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0) {
        throw new Error("House reserve balance would be invalid.");
      }

      await tx.update(houseReserve).set({
        balanceCents: balanceAfter,
        updatedAt: new Date(),
      }).where(eq(houseReserve.id, 1));
      await tx.insert(houseReserveEntries).values({
        type: action === "deposit" ? "admin_deposit" : "admin_withdrawal",
        amountCents,
        balanceBeforeCents: balanceBefore,
        balanceAfterCents: balanceAfter,
        adminUserId: user.sub,
        description: description || (action === "deposit" ? "Admin reserve funding" : "Admin profit withdrawal"),
      });
      return {
        balanceKes: balanceAfter / 100,
        reservedKes: reserve.reservedCents / 100,
        availableKes: (balanceAfter - reserve.reservedCents) / 100,
      };
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Reserve adjustment failed" });
  }
});

router.get("/house-reserve/ledger", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const rows = await db.select().from(houseReserveEntries)
    .orderBy(desc(houseReserveEntries.createdAt)).limit(100);
  res.json(rows.map(row => ({
    ...row,
    amountKes: row.amountCents / 100,
    balanceBeforeKes: row.balanceBeforeCents / 100,
    balanceAfterKes: row.balanceAfterCents / 100,
  })));
});

router.get("/game-control", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const [control] = await db.select().from(gameControl).where(eq(gameControl.id, 1));
  res.json({ paused: control?.isPaused ?? false, reason: control?.reason ?? null, updatedAt: control?.updatedAt?.toISOString() ?? null });
});

router.post("/game-control", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload;
  const paused = req.body?.paused;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 250) : "";
  if (typeof paused !== "boolean") { res.status(400).json({ error: "paused must be true or false" }); return; }
  const [existing] = await db.select({ id: gameControl.id }).from(gameControl).where(eq(gameControl.id, 1));
  if (existing) {
    await db.update(gameControl).set({ isPaused: paused, reason: paused ? (reason || "Paused by administrator") : null, updatedBy: user.sub, updatedAt: new Date() }).where(eq(gameControl.id, 1));
  } else {
    await db.insert(gameControl).values({ id: 1, isPaused: paused, reason: paused ? (reason || "Paused by administrator") : null, updatedBy: user.sub });
  }
  setGamePaused(paused);
  res.json({ success: true, paused, reason: paused ? (reason || "Paused by administrator") : null });
});

export default router;
