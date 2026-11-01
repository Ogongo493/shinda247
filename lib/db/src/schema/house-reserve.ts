import { pgTable, integer, bigint, varchar, timestamp, serial, text, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './users';
import { games } from './games';

// Singleton row (id=1) holds the independently funded operator reserve.
// All monetary values are integer minor units (KES cents).
export const houseReserve = pgTable('house_reserve', {
  id: integer('id').primaryKey().default(1),
  balanceCents: bigint('balance_cents', { mode: 'number' }).notNull().default(100000),
  reservedCents: bigint('reserved_cents', { mode: 'number' }).notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('KSH'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const houseReserveEntryTypeEnum = pgEnum('house_reserve_entry_type', [
  'seed', 'admin_deposit', 'admin_withdrawal', 'round_losses', 'round_payout',
]);

export const houseReserveEntries = pgTable('house_reserve_entries', {
  id: serial('id').primaryKey(),
  type: houseReserveEntryTypeEnum('type').notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  balanceBeforeCents: bigint('balance_before_cents', { mode: 'number' }).notNull(),
  balanceAfterCents: bigint('balance_after_cents', { mode: 'number' }).notNull(),
  adminUserId: integer('admin_user_id').references(() => users.id),
  gameId: integer('game_id').references(() => games.id),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type HouseReserve = typeof houseReserve.$inferSelect;
export type HouseReserveEntry = typeof houseReserveEntries.$inferSelect;
