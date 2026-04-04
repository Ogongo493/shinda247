import { Router, type IRouter, type Request } from "express";
import {
  GetGameStateResponse,
  GetGameHistoryResponse,
  PlaceBetBody,
  PlaceBetResponse,
  CashOutBody,
  CashOutResponse,
  GetActivePlayersResponse,
  GetLeaderboardResponse,
  GetWalletResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { wallets, transactions } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import * as engine from "../lib/gameEngine";
import { verifyJwt, extractToken } from "../lib/jwt";
import { requireAuth } from "./auth";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

const MIN_BET_KES = 10;
const MAX_BET_KES = 3_000; // matches Pakakumi — protects house liquidity

/** 1 bet per second per user — blocks bet-spamming bots */
const betLimiter = rateLimit({
  windowMs: 1000,
  max: 1,
  keyGenerator: (req) => (req as any).user?.sub ?? req.ip ?? "unknown",
  handler: (_req, res) => {
    res.status(429).json({ error: "You are betting too fast. Wait for the next round." });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/game/state", (_req, res) => {
  const state = engine.getState();
  const data = GetGameStateResponse.parse({
    phase:      state.phase,
    multiplier: state.multiplier,
    crashedAt:  state.crashedAt ?? null,
    roundId:    state.roundId,
    countdownMs: state.countdownMs ?? null,
    onlineCount: state.onlineCount,
    playingCount: state.playingCount,
  });
  res.json(data);
});

router.get("/game/history", async (_req, res) => {
  const limit = parseInt(String(_req.query.limit ?? "20"), 10);
  const rounds = await engine.getHistory(limit);
  const data = GetGameHistoryResponse.parse(
    rounds.map(r => ({
      id:        r.id,
      crashedAt: r.crashedAt ?? 1.0,
      hash:      r.hash,
      createdAt: r.createdAt.toISOString(),
    }))
  );
  res.json(data);
});

router.post("/game/bet", requireAuth, betLimiter, async (req: Request, res) => {
  const user = (req as any).user as { sub: number; username: string };

  const body = PlaceBetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const amount = body.data.amount;

  if (amount < MIN_BET_KES) {
    res.status(400).json({ error: `Minimum bet is KES ${MIN_BET_KES}` });
    return;
  }
  if (amount > MAX_BET_KES) {
    res.status(400).json({ error: `Maximum bet is KES ${MAX_BET_KES}` });
    return;
  }

  try {
    const result = await engine.placeBet(
      String(user.sub),
      amount,
      body.data.autoCashOut ?? null
    );
    const data = PlaceBetResponse.parse({ success: true, betId: result.betId, balance: result.balance });
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/game/cashout", requireAuth, async (req: Request, res) => {
  const user = (req as any).user as { sub: number };

  const body = CashOutBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const result = await engine.cashOut(body.data.betId, String(user.sub));
    const data = CashOutResponse.parse({ success: true, ...result });
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/players", (_req, res) => {
  const players = engine.getActivePlayers();
  const data = GetActivePlayersResponse.parse(
    players.map(p => ({
      id:        p.id,
      username:  p.username,
      amount:    p.amount,
      multiplier: p.multiplier ?? null,
      profit:    p.profit ?? null,
      cashedOut: p.cashedOut,
      hash:      p.hash,
    }))
  );
  res.json(data);
});

router.get("/players/leaderboard", async (_req, res) => {
  const leaderboard = await engine.getLeaderboardFromDB();
  const data = GetLeaderboardResponse.parse(leaderboard);
  res.json(data);
});

router.get("/wallet", async (req: Request, res) => {
  const authToken = extractToken(req.headers.authorization);
  if (authToken) {
    const payload = verifyJwt(authToken);
    if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }
    const [wallet] = await db.select({ balanceCents: wallets.balanceCents }).from(wallets).where(eq(wallets.userId, payload.sub));
    const balance = wallet ? wallet.balanceCents / 100 : 0;
    res.json({ balance, playerId: String(payload.sub) });
    return;
  }

  // Unauthenticated wallet lookups are no longer supported.
  // All wallet operations require a verified JWT (phone-based auth).
  res.status(401).json({ error: "Authentication required" });
});

router.get("/notifications", requireAuth, async (req: Request, res) => {
  const user = (req as any).user as { sub: number };
  try {
    const userTransactions = await db.select()
      .from(transactions)
      .where(eq(transactions.userId, user.sub))
      .orderBy(desc(transactions.createdAt))
      .limit(50);

    const notifications = userTransactions.map(tx => ({
      id:          tx.id,
      type:        tx.type,
      status:      tx.status,
      amountCents: tx.amountCents,
      description: tx.description,
      mpesaRef:    tx.mpesaRef,
      createdAt:   tx.createdAt.toISOString(),
    }));

    res.json(notifications);
  } catch {
    res.json([]);
  }
});

export default router;
