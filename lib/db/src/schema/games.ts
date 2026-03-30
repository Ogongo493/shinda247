import { pgTable, serial, integer, bigint, varchar, timestamp, pgEnum, boolean, index, unique } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './users';

export const gameStateEnum = pgEnum('game_state', [
  'waiting',
  'betting',
  'flying',
  'crashed',
]);

export const games = pgTable('games', {
  id:              serial('id').primaryKey(),
  hash:            varchar('hash', { length: 64 }).notNull().unique(),
  prevHash:        varchar('prev_hash', { length: 64 }),
  crashPoint:      integer('crash_point'),
  state:           gameStateEnum('state').notNull().default('waiting'),
  bettingOpenAt:   timestamp('betting_open_at'),
  bettingCloseAt:  timestamp('betting_close_at'),
  flyingStartAt:   timestamp('flying_start_at'),
  crashedAt:       timestamp('crashed_at'),
  elapsedMs:       integer('elapsed_ms'),
  totalBetsCents:  bigint('total_bets_cents', { mode: 'number' }).notNull().default(0),
  totalPayoutCents: bigint('total_payout_cents', { mode: 'number' }).notNull().default(0),
  playerCount:     integer('player_count').notNull().default(0),
  forced:          boolean('forced').notNull().default(false),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
});

export const betStateEnum = pgEnum('bet_state', [
  'active',
  'cashed_out',
  'lost',
  'refunded',
]);

export const bets = pgTable('bets', {
  id:            serial('id').primaryKey(),
  gameId:        integer('game_id').notNull().references(() => games.id),
  userId:        integer('user_id').notNull().references(() => users.id),
  amountCents:   bigint('amount_cents', { mode: 'number' }).notNull(),
  state:         betStateEnum('state').notNull().default('active'),
  autoCashoutAt: integer('auto_cashout_at'),
  cashedOutAt:   integer('cashed_out_at'),
  cashedOutTime: timestamp('cashed_out_time'),
  payoutCents:   bigint('payout_cents', { mode: 'number' }),
  xid:           integer('xid'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uniquePlayerGame: unique('unique_player_game').on(table.gameId, table.userId),
  gameIdIdx:        index('bets_game_id_idx').on(table.gameId),
  userIdIdx:        index('bets_user_id_idx').on(table.userId),
}));

export const insertGameSchema = createInsertSchema(games);
export const selectGameSchema = createSelectSchema(games);
export const insertBetSchema  = createInsertSchema(bets);
export const selectBetSchema  = createSelectSchema(bets);

export type Game = typeof games.$inferSelect;
export type Bet  = typeof bets.$inferSelect;
