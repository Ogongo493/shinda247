import { db } from '../index';
import { games, bets, wallets, transactions } from '../schema';
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

  // Lock the round row so bet placement and the phase transition cannot race.
  const transitioned = await db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id, state: games.state })
      .from(games).where(eq(games.id, gameId)).for('update');
    if (!game || game.state !== 'betting' || !currentGame ||
        currentGame.id !== gameId || currentGame.state !== 'betting') return false;
    await tx.update(games).set({
      state: 'flying', bettingCloseAt: new Date(), flyingStartAt: new Date(),
    }).where(eq(games.id, gameId));
    return true;
  });
  if (!transitioned || !currentGame || currentGame.id !== gameId) return;

  currentGame.state = 'flying';
  const crashX100 = computeCrashPoint(hash);
  const flightMs = crashPointToElapsed(crashX100);
  flyingStartTime = Date.now();
  broadcast('1502', {});

  let elapsed = 0;
  tickInterval = setInterval(() => {
    elapsed += 150;
    if (currentGame?.id === gameId) currentGame.elapsedMs = elapsed;
    for (const [userId, bet] of activeBets.entries()) {
      if (bet.cashedOutAt === null && bet.autoCashoutAt !== null) {
        const currentMultX100 = Math.round(Math.exp(elapsed / 35000) * 100);
        if (currentMultX100 >= bet.autoCashoutAt) {
          void processCashout(userId, gameId, bet.autoCashoutAt).catch(() => {
            // Keep a transient persistence failure from terminating the round loop.
          });
        }
      }
    }
    broadcast('1503', elapsed);
  }, 150);

  crashTimeout = setTimeout(() => void crashGame(gameId, crashX100, flightMs), flightMs);
}

async function crashGame(gameId: number, crashX100: number, elapsedMs: number): Promise<void> {
  if (!currentGame || currentGame.id !== gameId) return;
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }

  // The round lock serializes crash settlement with cash-outs.
  const crashed = await db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id, state: games.state })
      .from(games).where(eq(games.id, gameId)).for('update');
    if (!game || game.state === 'crashed') return false;

    await tx.update(games).set({
      state: 'crashed', crashPoint: crashX100, crashedAt: new Date(), elapsedMs,
    }).where(eq(games.id, gameId));
    await tx.update(bets).set({ state: 'lost' })
      .where(and(eq(bets.gameId, gameId), eq(bets.state, 'active')));
    return true;
  });
  if (!crashed || !currentGame || currentGame.id !== gameId) return;

  currentGame.state = 'crashed';
  currentGame.crashPoint = crashX100;
  broadcast('1504', {
    forced: false, elapsed: elapsedMs, gameId,
    gameCrash: crashX100 / 100, gameHash: currentGame.hash,
  });
  setTimeout(() => void startNewRound(), 3000);
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
  if (!Number.isSafeInteger(amountCents) || amountCents < 1000) {
    return { success: false, error: 'Minimum bet is KES 10' };
  }
  if (amountCents > 300000) {
    return { success: false, error: 'Maximum bet is KES 3,000' };
  }

  const gameId = currentGame.id;
  let placed: { betId: number; balance: number };
  try {
    placed = await db.transaction(async (tx) => {
      // Lock the round and wallet. The unique player/game constraint is the
      // final guard if two requests for the same player arrive together.
      const [game] = await tx.select({ id: games.id, state: games.state })
        .from(games).where(eq(games.id, gameId)).for('update');
      if (!game || game.state !== 'betting' || !currentGame ||
          currentGame.id !== gameId || currentGame.state !== 'betting') {
        throw new Error('Betting is not open');
      }

      const [wallet] = await tx.select().from(wallets)
        .where(eq(wallets.userId, userId)).for('update');
      if (!wallet) throw new Error('Wallet not found');
      const availableBalance = wallet.balanceCents - wallet.lockedCents;
      if (availableBalance < amountCents) {
        throw new Error('Insufficient balance. Available: KES ' + (availableBalance / 100).toFixed(2));
      }

      const [bet] = await tx.insert(bets).values({
        gameId, userId, amountCents, state: 'active', autoCashoutAt,
        xid: activeBets.size,
      }).returning({ id: bets.id });

      const balanceAfter = wallet.balanceCents - amountCents;
      await tx.update(wallets).set({
        balanceCents: balanceAfter, updatedAt: new Date(),
      }).where(eq(wallets.userId, userId));
      await tx.insert(transactions).values({
        userId, type: 'bet', status: 'completed', amountCents,
        balanceBefore: wallet.balanceCents, balanceAfter,
        gameId, betId: bet.id,
        description: 'Bet on game #' + gameId, processedAt: new Date(),
      });

      if (!currentGame || currentGame.id !== gameId || currentGame.state !== 'betting') {
        throw new Error('Betting is not open');
      }
      return { betId: bet.id, balance: balanceAfter / 100 };
    });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code) : '';
    if (code === '23505') {
      return { success: false, error: 'You already have a bet in this round' };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to place bet' };
  }

  activeBets.set(userId, { userId, username, amountCents, autoCashoutAt, cashedOutAt: null });
  if (currentGame?.id === gameId) {
    currentGame.playerCount++;
    currentGame.totalBetsCents += amountCents;
  }
  broadcast('1507', {
    plays: [{
      user_id: userId, username, bet: amountCents / 100, game_id: gameId,
      currency: 'KES', idx: activeBets.size - 1, created_at: new Date().toISOString(),
    }]
  });
  return { success: true, betId: placed.betId };
}

export async function processCashout(
  userId: number,
  gameId: number,
  requestedMultX100?: number
): Promise<{ success: boolean; payoutCents?: number; error?: string }> {
  if (!currentGame || currentGame.id !== gameId || currentGame.state !== 'flying') {
    return { success: false, error: 'Game is not in flight' };
  }

  let settled: { payoutCents: number; multiplierX100: number };
  try {
    settled = await db.transaction(async (tx) => {
      // The round lock serializes this payout with crash settlement.
      const [game] = await tx.select({ id: games.id, state: games.state, hash: games.hash })
        .from(games).where(eq(games.id, gameId)).for('update');
      if (!game || game.state !== 'flying' || !currentGame ||
          currentGame.id !== gameId || currentGame.state !== 'flying') {
        throw new Error('Game has already crashed');
      }

      const [bet] = await tx.select().from(bets)
        .where(and(eq(bets.gameId, gameId), eq(bets.userId, userId), eq(bets.state, 'active')))
        .for('update');
      if (!bet) throw new Error('No active bet found');

      const elapsed = Date.now() - (flyingStartTime ?? Date.now());
      const crashX100 = computeCrashPoint(game.hash);
      const crashElapsedMs = crashPointToElapsed(crashX100);
      const currentMultX100 = Math.round(Math.exp(Math.max(0, elapsed) / 35000) * 100);
      if (elapsed >= crashElapsedMs || currentMultX100 >= crashX100) {
        throw new Error('Game has already crashed');
      }

      const multiplierX100 = requestedMultX100 ?? currentMultX100;
      if (requestedMultX100 !== undefined && currentMultX100 < requestedMultX100) {
        throw new Error('Auto-cashout threshold has not been reached');
      }
      if (!Number.isSafeInteger(multiplierX100) || multiplierX100 < 100 || multiplierX100 >= crashX100) {
        throw new Error('Invalid cash-out multiplier');
      }

      const payoutCents = Math.floor(Number(bet.amountCents) * multiplierX100 / 100);
      const [wallet] = await tx.select().from(wallets)
        .where(eq(wallets.userId, userId)).for('update');
      if (!wallet) throw new Error('Wallet not found');

      const [updatedBet] = await tx.update(bets).set({
        state: 'cashed_out', cashedOutAt: multiplierX100,
        cashedOutTime: new Date(), payoutCents,
      }).where(and(eq(bets.id, bet.id), eq(bets.state, 'active')))
        .returning({ id: bets.id });
      if (!updatedBet) throw new Error('Already cashed out');

      const balanceAfter = wallet.balanceCents + payoutCents;
      await tx.update(wallets).set({
        balanceCents: balanceAfter, updatedAt: new Date(),
      }).where(eq(wallets.userId, userId));
      await tx.insert(transactions).values({
        userId, type: 'win', status: 'completed', amountCents: payoutCents,
        balanceBefore: wallet.balanceCents, balanceAfter,
        gameId, betId: bet.id,
        description: 'Cashout at ' + (multiplierX100 / 100).toFixed(2) + 'x on game #' + gameId,
        processedAt: new Date(),
      });
      return { payoutCents, multiplierX100 };
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Cash-out failed' };
  }

  const activeBet = activeBets.get(userId);
  if (activeBet) activeBet.cashedOutAt = settled.multiplierX100;
  broadcast('1505', {
    '0': { count: 1, amount: { KES: settled.payoutCents / 100 } },
    [userId]: { '0': settled.multiplierX100 / 100 },
  });
  return { success: true, payoutCents: settled.payoutCents };
}

async function recoverInterruptedGame(gameId: number): Promise<void> {
  // Refunds, bet updates and round recovery commit together to prevent
  // duplicate refunds if the server restarts during recovery.
  await db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id, state: games.state })
      .from(games).where(eq(games.id, gameId)).for('update');
    if (!game || game.state !== 'flying') return;

    const gameBets = await tx.select().from(bets)
      .where(and(eq(bets.gameId, gameId), eq(bets.state, 'active')))
      .for('update');

    for (const bet of gameBets) {
      const [wallet] = await tx.select().from(wallets)
        .where(eq(wallets.userId, bet.userId)).for('update');
      if (!wallet) throw new Error('Wallet not found for user ' + bet.userId);

      const amountCents = Number(bet.amountCents);
      const balanceAfter = wallet.balanceCents + amountCents;
      await tx.update(wallets).set({
        balanceCents: balanceAfter, updatedAt: new Date(),
      }).where(eq(wallets.userId, bet.userId));
      await tx.insert(transactions).values({
        userId: bet.userId, type: 'refund', status: 'completed',
        amountCents, balanceBefore: wallet.balanceCents, balanceAfter,
        gameId, betId: bet.id,
        description: 'Refund for interrupted game #' + gameId,
        processedAt: new Date(),
      });
      await tx.update(bets).set({ state: 'refunded' })
        .where(and(eq(bets.id, bet.id), eq(bets.state, 'active')));
    }
    await tx.update(games).set({ state: 'crashed', forced: true }).where(eq(games.id, gameId));
  });
}

