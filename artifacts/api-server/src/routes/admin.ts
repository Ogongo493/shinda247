import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users, wallets, transactions, games, bets } from "@workspace/db";
import { eq, desc, sql, count, sum } from "drizzle-orm";
import { requireAuth } from "./auth";
import type { JwtPayload } from "../lib/jwt";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: any): void {
  const user = (req as any).user as JwtPayload;
  if (!user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

router.get("/stats", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const [playerCount] = await db.select({ count: count() }).from(users);
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
  const [user] = await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db
    .update(users)
    .set({ isActive: !user.isActive })
    .where(eq(users.id, userId))
    .returning({ id: users.id, isActive: users.isActive });
  res.json(updated);
});

router.patch("/players/:id/toggle-admin", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const userId = parseInt(String(req.params.id));
  const [user] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db
    .update(users)
    .set({ isAdmin: !user.isAdmin })
    .where(eq(users.id, userId))
    .returning({ id: users.id, isAdmin: users.isAdmin });
  res.json(updated);
});

export default router;
