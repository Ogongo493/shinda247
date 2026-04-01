/**
 * botSimulator.ts
 *
 * UI-only bot activity. Bots have NO database backing — they do not debit
 * wallets, do not write to the bets table, and are never returned by
 * REST endpoints. They exist purely to populate the live-bet ticker on
 * the frontend during low-traffic periods.
 *
 * This module is wired in by gameEngine.ts via `attachBotSimulator`.
 * It listens for the same internal DB-engine events that gameEngine.ts
 * bridges and schedules fake bet/cashout activity relative to each round.
 */

import crypto from "crypto";
import { elapsedToMultiplier } from "@workspace/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotPlayer {
  id: string;
  username: string;
  amount: number;
  cashedOut: boolean;
}

type EmitFn = (event: string, data: unknown) => void;

// ─── Constants ────────────────────────────────────────────────────────────────

const BOT_NAMES = [
  "Peterode", "lagatsa",   "Brandd",    "Serrias",   "yegoro",
  "Johndo",   "Ourmae",    "Peterdc",   "kevinge",   "mutuah",
  "njoro.a",  "njugun",    "angira",    "Wafula",    "Kamau",
  "Muthoni",  "Odhiambo",  "Chepkemoi", "Githinji",  "Wanjiru",
];

const BOT_AMOUNTS = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000];

/**
 * Betting window in ms — must match the `setTimeout(..., 5000)` in
 * game.engine.ts `openBetting`. If that constant ever changes, update here.
 */
const BETTING_WINDOW_MS = 5000;

// ─── Module state ─────────────────────────────────────────────────────────────

let emitFn: EmitFn = () => {};

let activeBots      = new Map<string, BotPlayer>();
let betTimers:      ReturnType<typeof setTimeout>[] = [];
let cashoutTimers:  ReturnType<typeof setTimeout>[] = [];
let flyingStartedAt: number | null = null;
let isFlying        = false;
let activeGameId:   number | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clearAllTimers(): void {
  for (const t of betTimers)     clearTimeout(t);
  for (const t of cashoutTimers) clearTimeout(t);
  betTimers     = [];
  cashoutTimers = [];
}

// ─── Bot lifecycle ────────────────────────────────────────────────────────────

function scheduleBotBets(gameId: number): void {
  clearAllTimers();
  activeBots.clear();
  isFlying = false;

  const count     = randInt(4, 12);
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    let name: string;
    do { name = pick(BOT_NAMES); } while (usedNames.has(name));
    usedNames.add(name);

    const amount = pick(BOT_AMOUNTS);
    // Spread bets across the betting window, leaving 300 ms breathing room
    // at each end so bots never fire before betting opens or right as it closes.
    const delay  = randInt(300, BETTING_WINDOW_MS - 300);
    const botId  = "bot-" + crypto.randomBytes(4).toString("hex");

    const t = setTimeout(() => {
      if (activeGameId !== gameId || isFlying) return;

      activeBots.set(botId, { id: botId, username: name, amount, cashedOut: false });

      emitFn("game:bet", {
        playerId: botId,
        username: name,
        amount,
        isBot: true,
      });
    }, delay);

    betTimers.push(t);
  }
}

function scheduleBotCashouts(gameId: number): void {
  flyingStartedAt = Date.now();
  isFlying        = true;

  for (const [botId, bot] of activeBots.entries()) {
    if (bot.cashedOut) continue;
    if (Math.random() >= 0.65) continue; // 35 % ride to crash

    const delay = randInt(500, 18_000);

    const t = setTimeout(() => {
      if (activeGameId !== gameId || !isFlying) return;
      if (bot.cashedOut) return;

      const elapsed    = Date.now() - (flyingStartedAt ?? Date.now());
      const multiplier = elapsedToMultiplier(elapsed);

      if (multiplier < 1.05) return; // Don't emit at unrealistic low multiples

      bot.cashedOut = true;

      emitFn("game:cashout", {
        playerId:   botId,
        username:   bot.username,
        amount:     bot.amount,
        multiplier: Math.round(multiplier * 100) / 100,
        isBot:      true,
      });
    }, delay);

    cashoutTimers.push(t);
  }
}

function handleCrash(): void {
  for (const t of cashoutTimers) clearTimeout(t);
  cashoutTimers = [];
  isFlying      = false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Wire the bot simulator into the engine event stream.
 *
 * @param emit     The Socket.io emit function used by gameEngine.ts.
 * @param onEvent  A registration function that forwards internal DB-engine
 *                 events to subscribers (provided by gameEngine.ts).
 */
export function attachBotSimulator(
  emit: EmitFn,
  onEvent: (handler: (event: string, data: unknown) => void) => void
): void {
  emitFn = emit;

  onEvent((event, data) => {
    if (event === "betting_open") {
      const { gameId } = data as { gameId: number };
      activeGameId = gameId;
      scheduleBotBets(gameId);

    } else if (event === "1502") {
      if (activeGameId !== null) {
        scheduleBotCashouts(activeGameId);
      }

    } else if (event === "1504") {
      handleCrash();
    }
  });
}

/**
 * Return the current map of active bot players so `getActivePlayers` in
 * gameEngine.ts can merge them into the REST /players response.
 */
export function getActiveBotPlayers(): Map<string, BotPlayer> {
  return activeBots;
}
