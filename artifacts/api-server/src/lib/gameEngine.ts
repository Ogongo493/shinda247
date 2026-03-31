import crypto from "crypto";
import { db } from "@workspace/db";
import { games, bets, users, wallets } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { logger } from "./logger";
import {
  initGameEngine,
  getCurrentGame,
  getActiveBets,
  placeBet as enginePlaceBet,
  processCashout,
  setBroadcast,
  elapsedToMultiplier,
} from "@workspace/db";

export type GamePhase = "waiting" | "flying" | "crashed";

export interface GameState {
  phase: GamePhase;
  multiplier: number;
  crashedAt: number | null;
  roundId: number;
  countdownMs: number | null;
  onlineCount: number;
  playingCount: number;
  startTime: number | null;
  flyingStartedAt: number | null;
}

interface BotPlayer {
  id: string;
  username: string;
  amount: number;
  multiplier: number | null;
  profit: number | null;
  cashedOut: boolean;
  hash: string;
}

const BOT_NAMES = [
  "Peterode", "lagatsa", "Brandd", "Serrias", "yegoro",
  "Johndo", "Ourmae", "Peterdc", "kevinge", "mutuah",
  "njoro.a", "njugun", "angira", "Wafula", "Kamau",
  "Muthoni", "Odhiambo", "Chepkemoi", "Githinji", "Wanjiru",
];
const BOT_AMOUNTS = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000];

let botPlayers: Map<string, BotPlayer> = new Map();
let botCashoutTimers: ReturnType<typeof setTimeout>[] = [];
let botBetTimers: ReturnType<typeof setTimeout>[] = [];
let countdownInterval: ReturnType<typeof setInterval> | null = null;

let roundStartTime = Date.now();
let totalCountdownMs = 7000;
let flyingStartedAt: number | null = null;
let onlineCount = Math.floor(Math.random() * 500) + 800;
let currentEnginePhase: "waiting" | "betting" | "flying" | "crashed" = "waiting";

let emitFn: ((event: string, data: unknown) => void) | null = null;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildWaitingPayload(): GameState {
  const elapsed = Date.now() - roundStartTime;
  const remaining = Math.max(0, totalCountdownMs - elapsed);
  const game = getCurrentGame();
  return {
    phase: "waiting",
    multiplier: 1.0,
    crashedAt: null,
    roundId: game?.id ?? 0,
    countdownMs: remaining,
    onlineCount,
    playingCount: getActiveBets().length + botPlayers.size,
    startTime: null,
    flyingStartedAt: null,
  };
}

function buildFlyingPayload(elapsedMs: number): GameState {
  const game = getCurrentGame();
  const multiplier = elapsedToMultiplier(elapsedMs);
  return {
    phase: "flying",
    multiplier,
    crashedAt: null,
    roundId: game?.id ?? 0,
    countdownMs: null,
    onlineCount,
    playingCount: getActiveBets().length + botPlayers.size,
    startTime: flyingStartedAt,
    flyingStartedAt,
  };
}

function buildCrashedPayload(crashPoint: number): GameState {
  const game = getCurrentGame();
  const crashMult = crashPoint / 100;
  return {
    phase: "crashed",
    multiplier: crashMult,
    crashedAt: crashMult,
    roundId: game?.id ?? 0,
    countdownMs: null,
    onlineCount,
    playingCount: 0,
    startTime: null,
    flyingStartedAt: null,
  };
}

function scheduleBots(): void {
  for (const t of botBetTimers) clearTimeout(t);
  botBetTimers = [];
  botPlayers.clear();

  const count = randInt(4, 12);
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    let name: string;
    do { name = pick(BOT_NAMES); } while (usedNames.has(name));
    usedNames.add(name);

    const amount = pick(BOT_AMOUNTS);
    const delay = randInt(200, totalCountdownMs - 500);
    const botId = "bot-" + crypto.randomBytes(4).toString("hex");

    const t = setTimeout(() => {
      if (currentEnginePhase !== "waiting" && currentEnginePhase !== "betting") return;
      botPlayers.set(botId, {
        id: botId,
        username: name,
        amount,
        multiplier: null,
        profit: null,
        cashedOut: false,
        hash: crypto.randomBytes(8).toString("hex"),
      });
      emitFn?.("game:bet", {
        playerId: botId,
        username: name,
        amount,
        isBot: true,
      });
    }, delay);

    botBetTimers.push(t);
  }
}

function scheduleBotCashouts(gameId: number): void {
  for (const t of botCashoutTimers) clearTimeout(t);
  botCashoutTimers = [];

  for (const [botId, bot] of botPlayers.entries()) {
    if (bot.cashedOut) continue;
    const shouldCashOut = Math.random() < 0.65;
    if (!shouldCashOut) continue;

    const cashOutDelay = randInt(500, 18000);
    const t = setTimeout(() => {
      const g = getCurrentGame();
      if (!g || g.id !== gameId || g.state !== "flying") return;
      const elapsed = Date.now() - (flyingStartedAt ?? Date.now());
      const mult = elapsedToMultiplier(elapsed);
      if (mult < 1.05) return;
      const profit = Math.round((bot.amount * mult - bot.amount) * 100) / 100;
      bot.cashedOut = true;
      bot.multiplier = Math.round(mult * 100) / 100;
      bot.profit = profit;
      emitFn?.("game:cashout", {
        playerId: botId,
        username: bot.username,
        amount: bot.amount,
        multiplier: bot.multiplier,
        isBot: true,
      });
    }, cashOutDelay);

    botCashoutTimers.push(t);
  }
}

export function initEngine(broadcastFn: (event: string, data: unknown) => void): void {
  emitFn = broadcastFn;

  setBroadcast((event, data) => {
    if (event === "1501") {
      const { wait_ms } = data as { id: number; wait_ms: number };
      roundStartTime = Date.now();
      totalCountdownMs = wait_ms + 5000;
      flyingStartedAt = null;
      currentEnginePhase = "waiting";
      onlineCount = Math.floor(Math.random() * 500) + 800;

      scheduleBots();

      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = setInterval(() => {
        const g = getCurrentGame();
        if (!g || g.state === "flying" || g.state === "crashed") {
          if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
          return;
        }
        emitFn?.("game:state", buildWaitingPayload());
      }, 500);

      emitFn("game:newRound", {
        roundId: (data as { id: number }).id,
        countdownMs: totalCountdownMs,
      });

    } else if (event === "betting_open") {
      currentEnginePhase = "betting";

    } else if (event === "1502") {
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      currentEnginePhase = "flying";
      flyingStartedAt = Date.now();

      const game = getCurrentGame();
      if (game) scheduleBotCashouts(game.id);

      emitFn("game:state", buildFlyingPayload(0));

    } else if (event === "1503") {
      const elapsedMs = data as number;
      emitFn("game:state", buildFlyingPayload(elapsedMs));

    } else if (event === "1504") {
      for (const t of botCashoutTimers) clearTimeout(t);
      botCashoutTimers = [];
      currentEnginePhase = "crashed";

      const { gameCrash } = data as { gameCrash: number; gameHash: string; elapsed: number; gameId: number };
      const crashX100 = Math.round(gameCrash * 100);
      emitFn("game:crash", buildCrashedPayload(crashX100));

    } else if (event === "1505") {
      // Normalize cashout event from DB engine: { '0': { count, amount }, [userId]: { '0': multiplier } }
      const d = data as Record<string, any>;
      const activeBets = getActiveBets();
      for (const [key, val] of Object.entries(d)) {
        if (key === "0") continue;
        const userId = parseInt(key, 10);
        if (isNaN(userId)) continue;
        const multiplier = typeof val === "object" && "0" in val ? (val["0"] as number) : null;
        if (multiplier === null) continue;
        const bet = activeBets.find(b => b.userId === userId);
        emitFn("game:cashout", {
          playerId: key,
          username: bet?.username ?? "Player",
          amount: bet ? bet.amountCents / 100 : 0,
          multiplier,
          isBot: false,
        });
      }

    } else if (event === "1507") {
      // Normalize bet event from DB engine: { plays: [{ user_id, username, bet }] }
      const d = data as { plays: Array<{ user_id: number; username: string; bet: number }> };
      for (const play of (d.plays ?? [])) {
        emitFn("game:bet", {
          playerId: String(play.user_id),
          username: play.username,
          amount: play.bet,
          isBot: false,
        });
      }
    }
  });

  initGameEngine().catch(err => logger.error({ err }, "Failed to init game engine"));
}

export function getState(): GameState {
  const game = getCurrentGame();

  if (!game) {
    return {
      phase: "waiting",
      multiplier: 1.0,
      crashedAt: null,
      roundId: 0,
      countdownMs: totalCountdownMs,
      onlineCount,
      playingCount: 0,
      startTime: null,
      flyingStartedAt: null,
    };
  }

  if (game.state === "waiting" || game.state === "betting") {
    return buildWaitingPayload();
  }

  if (game.state === "flying") {
    return buildFlyingPayload(game.elapsedMs);
  }

  return buildCrashedPayload(game.crashPoint ?? 100);
}

export function getActivePlayers() {
  const engineBets = getActiveBets();

  const realPlayers = engineBets.map(bet => {
    const cashedOut = bet.cashedOutAt !== null;
    const cashMultX100 = bet.cashedOutAt ?? null;
    const cashMult = cashMultX100 !== null ? cashMultX100 / 100 : null;
    const profit = cashedOut && cashMult !== null
      ? Math.round((bet.amountCents * cashMult - bet.amountCents) / 100 * 100) / 100
      : null;

    return {
      id: String(bet.userId),
      username: bet.username,
      amount: bet.amountCents / 100,
      multiplier: cashMult,
      profit,
      cashedOut,
      hash: crypto.createHash("sha256").update(String(bet.userId)).digest("hex").slice(0, 16),
    };
  });

  const bots = Array.from(botPlayers.values());

  return [...realPlayers, ...bots];
}

export async function placeBet(
  playerId: string,
  amountKes: number,
  autoCashOut?: number | null
): Promise<{ betId: number; balance: number }> {
  const userId = parseInt(playerId, 10);
  if (isNaN(userId)) {
    throw new Error("Authentication required to place a bet");
  }

  const [user] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new Error("User not found");

  const amountCents = Math.round(amountKes * 100);
  const autoCashoutAt = autoCashOut ? Math.round(autoCashOut * 100) : null;

  const result = await enginePlaceBet(userId, user.username, amountCents, autoCashoutAt);
  if (!result.success) throw new Error(result.error ?? "Failed to place bet");

  const [wallet] = await db
    .select({ balanceCents: wallets.balanceCents })
    .from(wallets)
    .where(eq(wallets.userId, userId));

  return { betId: result.betId!, balance: wallet ? wallet.balanceCents / 100 : 0 };
}

export async function cashOut(
  betId: number,
  playerId: string
): Promise<{ profit: number; multiplier: number; balance: number }> {
  const userId = parseInt(playerId, 10);
  if (isNaN(userId)) throw new Error("Authentication required");

  const [bet] = await db
    .select()
    .from(bets)
    .where(and(eq(bets.id, betId), eq(bets.userId, userId)));
  if (!bet) throw new Error("Bet not found");

  const game = getCurrentGame();
  if (!game) throw new Error("No active game");

  const result = await processCashout(userId, game.id);
  if (!result.success) throw new Error(result.error ?? "Failed to cash out");

  const [wallet] = await db
    .select({ balanceCents: wallets.balanceCents })
    .from(wallets)
    .where(eq(wallets.userId, userId));

  const payoutCents = result.payoutCents!;
  const amountCents = Number(bet.amountCents);
  const multiplier = Math.round((payoutCents / amountCents) * 100) / 100;
  const profit = Math.round((payoutCents - amountCents) / 100 * 100) / 100;

  return { profit, multiplier, balance: wallet ? wallet.balanceCents / 100 : 0 };
}

export async function getHistory(limit = 20) {
  try {
    const rows = await db
      .select()
      .from(games)
      .where(eq(games.state, "crashed"))
      .orderBy(desc(games.id))
      .limit(limit);

    return rows.map(g => ({
      id: g.id,
      crashedAt: g.crashPoint ? g.crashPoint / 100 : 1.0,
      hash: g.hash,
      createdAt: g.createdAt,
    }));
  } catch {
    return [];
  }
}

export async function getLeaderboardFromDB(): Promise<Array<{ username: string; multiplier: number; amount: number }>> {
  try {
    const topBets = await db
      .select()
      .from(bets)
      .where(eq(bets.state, "cashed_out"))
      .orderBy(desc(bets.cashedOutAt))
      .limit(20);

    const results: Array<{ username: string; multiplier: number; amount: number }> = [];
    for (const bet of topBets) {
      if (!bet.cashedOutAt) continue;
      const [user] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, bet.userId));
      results.push({
        username: user?.username ?? "Player",
        multiplier: bet.cashedOutAt / 100,
        amount: Number(bet.amountCents) / 100,
      });
    }
    return results.length > 0 ? results : getFakeLeaderboard();
  } catch {
    return getFakeLeaderboard();
  }
}

function getFakeLeaderboard() {
  const names = [
    "Peterode", "lagatsa", "Brandd", "Serrias", "yegoro",
    "Johndo", "Ourmae", "kevinge", "mutuah", "njoro.a", "njugun", "angira",
  ];
  return names.map(n => ({
    username: n,
    multiplier: Math.round((Math.random() * 10 + 1.5) * 10) / 10,
    amount: [550, 700, 800, 1200, 1370, 1600, 3000, 4000, 4250][Math.floor(Math.random() * 9)],
  }));
}

export function getLeaderboard() {
  return getFakeLeaderboard();
}
