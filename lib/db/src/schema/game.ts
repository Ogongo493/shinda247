import { pgTable, serial, integer, real, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gamePhaseEnum = pgEnum("game_phase", ["waiting", "flying", "crashed"]);

export const gameRoundsTable = pgTable("game_rounds", {
  id: serial("id").primaryKey(),
  phase: gamePhaseEnum("phase").notNull().default("waiting"),
  crashedAt: real("crashed_at"),
  hash: text("hash").notNull(),
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const playersTable = pgTable("players", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  balance: real("balance").notNull().default(2330),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const betsTable = pgTable("bets_v1", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => gameRoundsTable.id),
  playerId: text("player_id").notNull().references(() => playersTable.id),
  amount: real("amount").notNull(),
  autoCashOut: real("auto_cash_out"),
  cashedOut: boolean("cashed_out").notNull().default(false),
  cashOutMultiplier: real("cash_out_multiplier"),
  profit: real("profit"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGameRoundSchema = createInsertSchema(gameRoundsTable).omit({ id: true });
export const insertPlayerSchema    = createInsertSchema(playersTable).omit({ createdAt: true });
export const insertBetV1Schema     = createInsertSchema(betsTable).omit({ id: true });

export type GameRound    = typeof gameRoundsTable.$inferSelect;
export type Player       = typeof playersTable.$inferSelect;
export type BetV1        = typeof betsTable.$inferSelect;
export type InsertGameRound = z.infer<typeof insertGameRoundSchema>;
export type InsertPlayer    = z.infer<typeof insertPlayerSchema>;
export type InsertBetV1     = z.infer<typeof insertBetV1Schema>;
