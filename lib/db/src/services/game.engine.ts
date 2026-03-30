import { db } from '../index';
import { games, bets } from '../schema';
import { eq, and, desc } from 'drizzle-orm';
import { computeCrashPoint, deriveNextHash, crashPointToElapsed, generateHashChain } from './rng.service';
import { creditWallet, debitWallet } from './wallet.service';

export type GamePhase = 'waiting' | 'betting' | 'flying' | 'crashed';

export interface GameState {
  id: number;
  hash: string;
  state: GamePhase;
  crashPoint: number | null;
  elapsedMs: number;
  playerCount: number;
  totalBetsCents: number;
}

export interface ActiveBet {
  userId: number;
  username: string;
  amountCents: number;
  autoCashoutAt: number | null;
  cashedOutAt: number | null;
}

let currentGame: GameState | null = null;
let activeBets: Map<number, ActiveBet> = new Map();
let flyingStartTime: number | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let crashTimeout: ReturnType<typeof setTimeout> | null = null;
let hashChain: string[] = [];
let chainIndex = 0;

type EventHandler = (event: string, data: unknown) => void;
let broadcast: EventHandler = () => {};

export function setBroadcast(fn: EventHandler) {
  broadcast = fn;
}

export function getCurrentGame(): GameState | null {
  return currentGame;
}

export function getActiveBets(): ActiveBet[] {
  return Array.from(activeBets.values());
}

export async function initGameEngine(chain?: string[]): Promise<void> {
  hashChain = chain ?? generateHashChain(1000);
  chainIndex = 0;

  const [lastGame] = await db
    .select()
    .from(games)
    .where(eq(games.state, 'flying'))
    .orderBy(desc(games.id))
    .limit(1);

  if (lastGame) {
    await recoverInterruptedGame(lastGame.id);
  }

  startNewRound();
}

async function startNewRound(): Promise<void> {
  activeBets.clear();
  flyingStartTime = null;

  const hash = hashChain[chainIndex % hashChain.length];
  chainIndex++;

  const [game] = await db
    .insert(games)
    .values({ hash, state: 'waiting', bettingOpenAt: new Date(Date.now() + 2000) })
    .returning();

  currentGame = {
    id: game.id, hash: game.hash, state: 'waiting',
    crashPoint: null, elapsedMs: 0, playerCount: 0, totalBetsCents: 0,
  };

  broadcast('1501', { id: game.id, wait_ms: 2000 });
  setTimeout(() => openBetting(game.id, hash), 2000);
}

async function openBetting(gameId: number, hash: string): Promise<void> {
  if (!currentGame || currentGame.id !== gameId) return;
  currentGame.state = 'betting';
  await db.update(games).set({ state: 'betting', bettingOpenAt: new Date() }).where(eq(games.id, gameId));
  broadcast('betting_open', { gameId });
  setTimeout(() => closeBetting(gameId, hash), 5000);
}

async function closeBetting(gameId: number, hash: string): Promise<void> {
  if (!currentGame || currentGame.id !== gameId) return;

  currentGame.state = 'flying';
  const crashX100 = computeCrashPoint(hash);
  const flightMs  = crashPointToElapsed(crashX100);
  flyingStartTime = Date.now();

  await db.update(games).set({
    state: 'flying', bettingCloseAt: new Date(), flyingStartAt: new Date(),
  }).where(eq(games.id, gameId));

  broadcast('1502', {});

  let elapsed = 0;
  tickInterval = setInterval(() => {
    elapsed += 150;
    currentGame!.elapsedMs = elapsed;

    for (const [userId, bet] of activeBets.entries()) {
      if (bet.cashedOutAt === null && bet.autoCashoutAt !== null) {
        const currentMultX100 = Math.round(Math.exp(elapsed / 35000) * 100);
        if (currentMultX100 >= bet.autoCashoutAt) {
          processCashout(userId, gameId, bet.autoCashoutAt);
        }
      }
    }

    broadcast('1503', elapsed);
  }, 150);

  crashTimeout = setTimeout(() => crashGame(gameId, crashX100, flightMs), flightMs);
}

async function crashGame(gameId: number, crashX100: number, elapsedMs: number): Promise<void> {
  if (!currentGame || currentGame.id !== gameId) return;

  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }

  currentGame.state      = 'crashed';
  currentGame.crashPoint = crashX100;

  await db.update(games).set({
    state: 'crashed', crashPoint: crashX100, crashedAt: new Date(), elapsedMs,
  }).where(eq(games.id, gameId));

  for (const [userId, bet] of activeBets.entries()) {
    if (bet.cashedOutAt === null) {
      await db.update(bets)
        .set({ state: 'lost' })
        .where(and(eq(bets.gameId, gameId), eq(bets.userId, userId)));
    }
  }

  broadcast('1504', {
    forced: false, elapsed: elapsedMs, gameId,
    gameCrash: crashX100 / 100, gameHash: currentGame.hash,
  });

  setTimeout(() => startNewRound(), 3000);
}

export async function placeBet(
  userId: number,
  username: string,
  amountCents: number,
  autoCashoutAt: number | null
): Promise<{ success: boolean; error?: string; betId?: number }> {
  if (!currentGame || currentGame.state !== 'betting') {
    return { success: false, error: 'Betting is not open' };
  }
  if (activeBets.has(userId)) {
    return { success: false, error: 'You already have an active bet' };
  }
  if (amountCents < 100) {
    return { success: false, error: 'Minimum bet is KES 1' };
  }
  if (amountCents > 300000) {
    return { success: false, error: 'Maximum bet is KES 3,000' };
  }

  const debit = await debitWallet(userId, amountCents, 'bet', {
    gameId: currentGame.id, description: `Bet on game #${currentGame.id}`,
  });

  if (!debit.success) return { success: false, error: debit.error };

  const [bet] = await db.insert(bets).values({
    gameId: currentGame.id, userId, amountCents,
    state: 'active', autoCashoutAt, xid: activeBets.size,
  }).returning({ id: bets.id });

  activeBets.set(userId, { userId, username, amountCents, autoCashoutAt, cashedOutAt: null });
  currentGame.playerCount++;
  currentGame.totalBetsCents += amountCents;

  broadcast('1507', {
    plays: [{
      user_id: userId, username,
      bet: amountCents / 100, game_id: currentGame.id,
      currency: 'KES', idx: activeBets.size - 1,
      created_at: new Date().toISOString(),
    }]
  });

  return { success: true, betId: bet.id };
}

export async function processCashout(
  userId: number,
  gameId: number,
  requestedMultX100?: number
): Promise<{ success: boolean; payoutCents?: number; error?: string }> {
  if (!currentGame || currentGame.id !== gameId) {
    return { success: false, error: 'Game not found' };
  }
  if (currentGame.state === 'crashed') {
    return { success: false, error: 'Game has already crashed' };
  }
  if (currentGame.state !== 'flying') {
    return { success: false, error: 'Game is not in flight' };
  }

  const bet = activeBets.get(userId);
  if (!bet) return { success: false, error: 'No active bet found' };
  if (bet.cashedOutAt !== null) return { success: false, error: 'Already cashed out' };

  const elapsed = Date.now() - (flyingStartTime ?? 0);
  const currentMultX100 = Math.round(Math.exp(elapsed / 35000) * 100);

  bet.cashedOutAt = currentMultX100;
  const payoutCents = Math.floor(bet.amountCents * currentMultX100 / 100);

  await db.update(bets).set({
    state: 'cashed_out', cashedOutAt: currentMultX100,
    cashedOutTime: new Date(), payoutCents,
  }).where(and(eq(bets.gameId, gameId), eq(bets.userId, userId)));

  await creditWallet(userId, payoutCents, 'win', {
    gameId, description: `Cashout at ${(currentMultX100 / 100).toFixed(2)}x on game #${gameId}`,
  });

  broadcast('1505', {
    '0': { count: 1, amount: { KES: payoutCents / 100 } },
    [userId]: { '0': currentMultX100 / 100 },
  });

  return { success: true, payoutCents };
}

async function recoverInterruptedGame(gameId: number): Promise<void> {
  const gameBets = await db.select().from(bets).where(eq(bets.gameId, gameId));
  for (const bet of gameBets) {
    if (bet.state === 'active') {
      await creditWallet(bet.userId, Number(bet.amountCents), 'refund', {
        gameId, description: `Refund for interrupted game #${gameId}`,
      });
      await db.update(bets).set({ state: 'refunded' }).where(eq(bets.id, bet.id));
    }
  }
  await db.update(games).set({ state: 'crashed', forced: true }).where(eq(games.id, gameId));
}
