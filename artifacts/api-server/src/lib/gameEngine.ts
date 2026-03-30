import crypto from "crypto";
import { db } from "@workspace/db";
import { gameRoundsTable, betsTable, playersTable, wallets, users } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { logger } from "./logger";
import { writeGameState } from "./rtdb";

function isRealUser(playerId: string): boolean {
  return /^\d+$/.test(playerId);
}

export type GamePhase = "waiting" | "flying" | "crashed";

interface GameState {
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

interface ActivePlayer {
  id: string;
  username: string;
  amount: number;
  multiplier: number | null;
  profit: number | null;
  cashedOut: boolean;
  hash: string;
}

const WAITING_DURATION_MS = 15000;
const MIN_CRASH = 1.0;

let state: GameState = {
  phase: "waiting",
  multiplier: 1.0,
  crashedAt: null,
  roundId: 0,
  countdownMs: WAITING_DURATION_MS,
  onlineCount: Math.floor(Math.random() * 500) + 800,
  playingCount: 0,
  startTime: null,
  flyingStartedAt: null,
};

let activePlayers: Map<string, ActivePlayer> = new Map();
let currentRoundId = 0;
let waitingStartTime = Date.now();
let currentHash = "";
let targetCrashMultiplier = 2.0;
let lastEmitTime = 0;

function generateHash(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateCrashPoint(): number {
  const rand = Math.random();
  if (rand < 0.01) return 1.0;
  const crash = Math.max(MIN_CRASH, (1 / (1 - rand)) * 0.97);
  return Math.round(crash * 100) / 100;
}

function getMultiplierAtTime(ms: number): number {
  const t = ms / 1000;
  return Math.round((1.0024 ** (t * 100)) * 100) / 100;
}

async function startNewRound() {
  currentHash = generateHash();
  targetCrashMultiplier = generateCrashPoint();

  try {
    const [round] = await db.insert(gameRoundsTable).values({
      phase: "waiting",
      hash: currentHash,
      crashedAt: null,
    }).returning();
    currentRoundId = round.id;

    state = {
      phase: "waiting",
      multiplier: 1.0,
      crashedAt: null,
      roundId: currentRoundId,
      countdownMs: WAITING_DURATION_MS,
      onlineCount: Math.floor(Math.random() * 500) + 800,
      playingCount: 0,
      startTime: null,
      flyingStartedAt: null,
    };
    activePlayers = new Map();
    waitingStartTime = Date.now();
  } catch (err) {
    logger.error({ err }, "Failed to start new round in DB");
    currentRoundId = Math.floor(Math.random() * 100000);
    state = {
      phase: "waiting",
      multiplier: 1.0,
      crashedAt: null,
      roundId: currentRoundId,
      countdownMs: WAITING_DURATION_MS,
      onlineCount: Math.floor(Math.random() * 500) + 800,
      playingCount: 0,
      startTime: null,
      flyingStartedAt: null,
    };
    activePlayers = new Map();
    waitingStartTime = Date.now();
  }

  writeGameState({
    phase: "waiting",
    multiplier: 1.0,
    crashedAt: null,
    roundId: currentRoundId,
    countdownMs: WAITING_DURATION_MS,
    onlineCount: state.onlineCount,
    playingCount: state.playingCount,
    flyingStartedAt: null,
  });
  addSimulatedPlayers();
}

function addSimulatedPlayers() {
  const names = [
    "Peterode", "lagatsa", "Brandd", "Serrias", "yegoro",
    "Johndo", "Ourmae", "kevinge", "mutuah", "njoro",
    "njugun", "angira", "kipyego", "wanjohi", "Kamau"
  ];

  const count = Math.floor(Math.random() * 8) + 5;
  for (let i = 0; i < count; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const id = `sim-${name}-${Date.now()}-${i}`;
    const amount = [50, 100, 200, 300, 500, 800, 1000, 1200, 2000, 3000][Math.floor(Math.random() * 10)];
    activePlayers.set(id, {
      id,
      username: name,
      amount,
      multiplier: null,
      profit: null,
      cashedOut: false,
      hash: generateHash(),
    });
  }
}

function tickGame() {
  const now = Date.now();

  if (state.phase === "waiting") {
    const elapsed = now - waitingStartTime;
    const remaining = WAITING_DURATION_MS - elapsed;
    state.countdownMs = Math.max(0, remaining);
    state.playingCount = activePlayers.size;

    // Write countdown every ~500ms during waiting
    if (now - lastEmitTime >= 500) {
      lastEmitTime = now;
      writeGameState({
        phase: state.phase,
        multiplier: state.multiplier,
        crashedAt: state.crashedAt,
        roundId: state.roundId,
        countdownMs: state.countdownMs,
        onlineCount: state.onlineCount,
        playingCount: state.playingCount,
        flyingStartedAt: null,
      });
    }

    if (remaining <= 0) {
      state.phase = "flying";
      state.startTime = now;
      state.flyingStartedAt = now;
      state.countdownMs = null;
      lastEmitTime = 0;

      try {
        db.update(gameRoundsTable)
          .set({ phase: "flying", startedAt: new Date() })
          .where(eq(gameRoundsTable.id, currentRoundId))
          .catch(() => {});
      } catch {}

      writeGameState({
        phase: "flying",
        multiplier: 1.0,
        crashedAt: null,
        roundId: state.roundId,
        countdownMs: null,
        onlineCount: state.onlineCount,
        playingCount: state.playingCount,
        flyingStartedAt: state.flyingStartedAt,
      });
    }
  } else if (state.phase === "flying") {
    const elapsed = now - (state.startTime || now);
    const mult = getMultiplierAtTime(elapsed);
    state.multiplier = mult;
    state.playingCount = activePlayers.size;

    for (const [, player] of activePlayers) {
      if (!player.cashedOut) {
        if (Math.random() < 0.002 && mult > 1.2) {
          player.cashedOut = true;
          player.multiplier = mult;
          player.profit = Math.round(player.amount * mult - player.amount);
        }
      }
    }

    // Write every 500ms during flying — client interpolates at 60fps locally
    if (now - lastEmitTime >= 500) {
      lastEmitTime = now;
      writeGameState({
        phase: "flying",
        multiplier: mult,
        crashedAt: null,
        roundId: state.roundId,
        countdownMs: null,
        onlineCount: state.onlineCount,
        playingCount: state.playingCount,
        flyingStartedAt: state.flyingStartedAt,
      });
    }

    if (mult >= targetCrashMultiplier) {
      state.phase = "crashed";
      state.crashedAt = targetCrashMultiplier;
      state.multiplier = targetCrashMultiplier;

      try {
        db.update(gameRoundsTable)
          .set({ phase: "crashed", crashedAt: targetCrashMultiplier })
          .where(eq(gameRoundsTable.id, currentRoundId))
          .catch(() => {});
      } catch {}

      writeGameState({
        phase: "crashed",
        multiplier: targetCrashMultiplier,
        crashedAt: targetCrashMultiplier,
        roundId: state.roundId,
        countdownMs: null,
        onlineCount: state.onlineCount,
        playingCount: state.playingCount,
        flyingStartedAt: null,
      });

      setTimeout(() => {
        startNewRound();
      }, 4000);
    }
  }
}

export function getState(): GameState {
  return { ...state };
}

export function getActivePlayers(): ActivePlayer[] {
  return Array.from(activePlayers.values());
}

export async function placeBet(playerId: string, amount: number, autoCashOut?: number | null): Promise<{ betId: number; balance: number }> {
  if (state.phase !== "waiting") {
    throw new Error("Bets can only be placed during the waiting phase");
  }

  let username = "Player";
  let currentBalanceKes = 0;

  if (isRealUser(playerId)) {
    const userId = parseInt(playerId);
    const [wallet] = await db.select({ balanceCents: wallets.balanceCents }).from(wallets).where(eq(wallets.userId, userId));
    if (!wallet) throw new Error("Wallet not found. Please contact support.");
    currentBalanceKes = wallet.balanceCents / 100;
    if (currentBalanceKes < amount) throw new Error("Insufficient balance");
    const amountCents = Math.round(amount * 100);
    await db.update(wallets).set({ balanceCents: wallet.balanceCents - amountCents }).where(eq(wallets.userId, userId));
    const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
    username = user?.username ?? "Player";
    const newBalance = (wallet.balanceCents - amountCents) / 100;
    const [bet] = await db.insert(betsTable).values({ roundId: currentRoundId, playerId, amount, autoCashOut: autoCashOut ?? null, cashedOut: false }).returning();
    activePlayers.set(playerId, { id: playerId, username, amount, multiplier: null, profit: null, cashedOut: false, hash: generateHash() });
    return { betId: bet.id, balance: newBalance };
  }

  let player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) throw new Error("Player not found");
  if (player.balance < amount) throw new Error("Insufficient balance");

  const newBalance = player.balance - amount;
  await db.update(playersTable).set({ balance: newBalance }).where(eq(playersTable.id, playerId));

  const [bet] = await db.insert(betsTable).values({
    roundId: currentRoundId,
    playerId,
    amount,
    autoCashOut: autoCashOut ?? null,
    cashedOut: false,
  }).returning();

  activePlayers.set(playerId, {
    id: playerId,
    username: player.username,
    amount,
    multiplier: null,
    profit: null,
    cashedOut: false,
    hash: generateHash(),
  });

  return { betId: bet.id, balance: newBalance };
}

export async function cashOut(betId: number, playerId: string): Promise<{ profit: number; multiplier: number; balance: number }> {
  if (state.phase !== "flying") {
    throw new Error("Can only cash out during flying phase");
  }

  const bet = await db.query.betsTable.findFirst({
    where: eq(betsTable.id, betId)
  });

  if (!bet || bet.playerId !== playerId) {
    throw new Error("Bet not found");
  }
  if (bet.cashedOut) {
    throw new Error("Already cashed out");
  }

  const mult = state.multiplier;
  const profit = Math.round((bet.amount * mult - bet.amount) * 100) / 100;

  await db.update(betsTable).set({
    cashedOut: true,
    cashOutMultiplier: mult,
    profit,
  }).where(eq(betsTable.id, betId));

  let newBalance = 0;
  if (isRealUser(playerId)) {
    const userId = parseInt(playerId);
    const [wallet] = await db.select({ balanceCents: wallets.balanceCents }).from(wallets).where(eq(wallets.userId, userId));
    const payoutCents = Math.round((bet.amount + profit) * 100);
    newBalance = ((wallet?.balanceCents ?? 0) + payoutCents) / 100;
    await db.update(wallets).set({ balanceCents: (wallet?.balanceCents ?? 0) + payoutCents }).where(eq(wallets.userId, userId));
  } else {
    const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
    newBalance = (player?.balance ?? 0) + bet.amount + profit;
    await db.update(playersTable).set({ balance: newBalance }).where(eq(playersTable.id, playerId));
  }

  const activePlayer = activePlayers.get(playerId);
  if (activePlayer) {
    activePlayer.cashedOut = true;
    activePlayer.multiplier = mult;
    activePlayer.profit = profit;
  }

  return { profit, multiplier: mult, balance: newBalance };
}

export async function addBot(botId: string, username: string, amount: number): Promise<void> {
  if (state.phase !== "waiting") return;
  if (activePlayers.has(botId)) return;
  activePlayers.set(botId, {
    id: botId,
    username,
    amount,
    multiplier: null,
    profit: null,
    cashedOut: false,
    hash: generateHash(),
  });
}

export async function getHistory(limit = 20): Promise<typeof gameRoundsTable.$inferSelect[]> {
  try {
    return await db.select().from(gameRoundsTable)
      .where(eq(gameRoundsTable.phase, "crashed"))
      .orderBy(desc(gameRoundsTable.id))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function getLeaderboardFromDB(): Promise<Array<{ username: string; multiplier: number; amount: number }>> {
  try {
    const topBets = await db.select({
      playerId: betsTable.playerId,
      amount: betsTable.amount,
      cashOutMultiplier: betsTable.cashOutMultiplier,
      profit: betsTable.profit,
    })
      .from(betsTable)
      .where(and(eq(betsTable.cashedOut, true)))
      .orderBy(desc(betsTable.cashOutMultiplier))
      .limit(20);

    const results: Array<{ username: string; multiplier: number; amount: number }> = [];

    for (const bet of topBets) {
      if (!bet.cashOutMultiplier) continue;
      let username = "Player";
      if (isRealUser(bet.playerId)) {
        const userId = parseInt(bet.playerId);
        const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
        username = user?.username ?? "Player";
      } else {
        const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, bet.playerId) });
        username = player?.username ?? bet.playerId.replace(/sim-/, "").split("-")[0] ?? "Bot";
      }
      results.push({ username, multiplier: bet.cashOutMultiplier, amount: bet.amount });
    }

    return results;
  } catch {
    return getFakeLeaderboard();
  }
}

function getFakeLeaderboard() {
  const names = [
    "Peterode", "lagatsa", "Brandd", "Serrias", "yegoro",
    "Johndo", "Ourmae", "Peterdc", "kevinge", "mutuah",
    "njoro.a", "njugun", "angira"
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

startNewRound();
setInterval(tickGame, 100);
