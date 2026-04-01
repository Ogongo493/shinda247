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
import { attachBotSimulator, getActiveBotPlayers } from "./botSimulator";

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

let countdownInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Total countdown the frontend sees for each new round:
 *   wait_ms  (reported in 1501, currently 2 000 ms in game.engine.ts)
 * + BETTING_WINDOW_MS (5 000 ms in game.engine.ts)
 * Stored so the /game/state REST endpoint can report it accurately.
 */
const BETTING_WINDOW_MS = 5000;
let roundStartTime   = Date.now();
let totalCountdownMs = BETTING_WINDOW_MS + 2000; // refreshed on every 1501
let flyingStartedAt: number | null = null;
let onlineCount      = Math.floor(Math.random() * 500) + 800;

let emitFn: ((event: string, data: unknown) => void) | null = null;

/**
 * Engine-event fan-out - allows botSimulator (and any future module) to
 * observe raw DB-engine events without coupling directly to setBroadcast.
 */
const engineEventListeners: Array<(event: string, data: unknown) => void> = [];

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
    playingCount: getActiveBets().length + getActiveBotPlayers().size,
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
    playingCount: getActiveBets().length + getActiveBotPlayers().size,
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

export function initEngine(broadcastFn: (event: string, data: unknown) => void): void {
  emitFn = broadcastFn;

  // Wire up bot simulator - it observes the same event stream via the fan-out.
  attachBotSimulator(broadcastFn, (handler) => {
    engineEventListeners.push(handler);
  });

  setBroadcast((event, data) => {
    // emitFn is always set before setBroadcast fires (assigned two lines above),
    // but the module-level type includes null for pre-init safety. Capture a
    // local non-null reference so every call site below is type-safe.
    const emit = emitFn!;

    // Fan out to all secondary listeners (bot simulator, etc.) first.
    for (const listener of engineEventListeners) {
      try { listener(event, data); } catch { /* never let a listener kill the game loop */ }
    }

    if (event === "1501") {
      // New round created. Snapshot timing so the REST /game/state endpoint
      // can compute the remaining countdown without a live interval.
      const { wait_ms } = data as { id: number; wait_ms: number };
      roundStartTime   = Date.now();
      totalCountdownMs = wait_ms + BETTING_WINDOW_MS;
      flyingStartedAt  = null;
      onlineCount      = Math.floor(Math.random() * 500) + 800;

      // Poll every 500 ms so the frontend countdown stays current.
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = setInterval(() => {
        const g = getCurrentGame();
        if (!g || g.state === "flying" || g.state === "crashed") {
          if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
          return;
        }
        emit("game:state", buildWaitingPayload());
      }, 500);

      emit("game:newRound", {
        roundId:     (data as { id: number }).id,
        countdownMs: totalCountdownMs,
      });

    } else if (event === "betting_open") {
      // Phase transition only - no frontend event needed; countdown continues.

    } else if (event === "1502") {
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      flyingStartedAt = Date.now();
      emit("game:state", buildFlyingPayload(0));

    } else if (event === "1503") {
      const elapsedMs = data as number;
      emit("game:state", buildFlyingPayload(elapsedMs));

    } else if (event === "1504") {
      const { gameCrash } = data as { gameCrash: number; gameHash: string; elapsed: number; gameId: number };
      // gameCrash is already crashX100 / 100 (a float, e.g. 2.34).
      // buildCrashedPayload expects crashX100 (integer), so multiply back.
      const crashX100 = Math.round(gameCrash * 100);
      emit("game:crash", buildCrashedPayload(crashX100));

    } else if (event === "1505") {
      // DB engine cashout: { '0': { count, amount }, [userId]: { '0': multiplier } }
      const d          = data as Record<string, any>;
      const activeBets = getActiveBets();

      for (const [key, val] of Object.entries(d)) {
        if (key === "0") continue;
        const userId    = parseInt(key, 10);
        if (isNaN(userId)) continue;
        const multiplier = typeof val === "object" && "0" in val ? (val["0"] as number) : null;
        if (multiplier === null) continue;

        const bet = activeBets.find(b => b.userId === userId);
        emit("game:cashout", {
          playerId:   key,
          username:   bet?.username ?? "Player",
          amount:     bet ? bet.amountCents / 100 : 0,
          multiplier,
          isBot:      false,
        });
      }

    } else if (event === "1507") {
      // DB engine bet placement: { plays: [{ user_id, username, bet, ... }] }
      const d = data as { plays: Array<{ user_id: number; username: string; bet: number }> };
      for (const play of (d.plays ?? [])) {
        emit("game:bet", {
          playerId: String(play.user_id),
          username: play.username,
          amount:   play.bet,
          isBot:    false,
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
    // Use wall-clock elapsed from the moment the rocket launched rather than
    // game.elapsedMs, which is only persisted to the DB on crash. This ensures
    // a late HTTP poll gets an accurate multiplier even between tick events.
    const liveElapsedMs = flyingStartedAt !== null
      ? Date.now() - flyingStartedAt
      : game.elapsedMs;
    return buildFlyingPayload(liveElapsedMs);
  }

  return buildCrashedPayload(game.crashPoint ?? 100);
}

export function getActivePlayers() {
  const engineBets = getActiveBets();

  const realPlayers = engineBets.map(bet => {
    const cashedOut    = bet.cashedOutAt !== null;
    const cashMultX100 = bet.cashedOutAt ?? null;
    const cashMult     = cashMultX100 !== null ? cashMultX100 / 100 : null;
    const profit       = cashedOut && cashMult !== null
      ? Math.round((bet.amountCents * cashMult - bet.amountCents) / 100 * 100) / 100
      : null;

    return {
      id:         String(bet.userId),
      username:   bet.username,
      amount:     bet.amountCents / 100,
      multiplier: cashMult,
      profit,
      cashedOut,
      hash: crypto.createHash("sha256").update(String(bet.userId)).digest("hex").slice(0, 16),
    };
  });

  // Merge in UI-only bots from the bot simulator
  const bots = Array.from(getActiveBotPlayers().values()).map(bot => ({
    id:         bot.id,
    username:   bot.username,
    amount:     bot.amount,
    multiplier: null,
    profit:     null,
    cashedOut:  bot.cashedOut,
    hash:       bot.id.slice(-16),
  }));

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
    const rows = await db
      .select({
        username:    users.username,
        cashedOutAt: bets.cashedOutAt,
        amountCents: bets.amountCents,
      })
      .from(bets)
      .innerJoin(users, eq(bets.userId, users.id))
      .where(eq(bets.state, "cashed_out"))
      .orderBy(desc(bets.cashedOutAt))
      .limit(20);

    const results = rows
      .filter(r => r.cashedOutAt != null)
      .map(r => ({
        username:   r.username,
        multiplier: r.cashedOutAt! / 100,
        amount:     Number(r.amountCents) / 100,
      }));

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
