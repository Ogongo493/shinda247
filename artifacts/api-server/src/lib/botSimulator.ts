import { logger } from "./logger";
import * as engine from "./gameEngine";

const BOT_NAMES = [
  "Peterode", "lagatsa", "Brandd", "Serrias", "yegoro",
  "Johndo", "Ourmae", "Peterdc", "kevinge", "mutuah",
  "njoro.a", "njugun", "angira", "Wafula", "Kamau",
  "Muthoni", "Odhiambo", "Chepkemoi", "Githinji", "Wanjiru",
];

const BOT_AMOUNTS = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4250, 5000];

let scheduledBots: ReturnType<typeof setTimeout>[] = [];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateBotId(): string {
  return "bot-" + Math.random().toString(36).slice(2, 9);
}

export function scheduleBots(): void {
  for (const t of scheduledBots) clearTimeout(t);
  scheduledBots = [];

  const count = randomInt(4, 12);
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    let name: string;
    do {
      name = pickRandom(BOT_NAMES);
    } while (usedNames.has(name));
    usedNames.add(name);

    const amount  = pickRandom(BOT_AMOUNTS);
    const delay   = randomInt(200, 3500);
    const botId   = generateBotId();
    const botName = name;

    const t = setTimeout(async () => {
      try {
        const state = engine.getState();
        if (state.phase !== "waiting") return;

        await engine.addBot(botId, botName, amount);
        logger.debug({ botId: botId, botName, amount }, "Bot placed bet");
      } catch (err) {
        logger.debug({ err }, "Bot bet failed");
      }
    }, delay);

    scheduledBots.push(t);
  }
}

export function startBotSimulator(): void {
  logger.info("Bot simulator started");
}
