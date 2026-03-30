import { pgTable, serial, integer, bigint, varchar, timestamp, pgEnum, boolean, text } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './users';

export const transactionTypeEnum = pgEnum('transaction_type', [
  'deposit',
  'withdrawal',
  'bet',
  'win',
  'refund',
  'bonus',
]);

export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'completed',
  'failed',
  'cancelled',
]);

export const wallets = pgTable('wallets', {
  id:             serial('id').primaryKey(),
  userId:         integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  balanceCents:   bigint('balance_cents', { mode: 'number' }).notNull().default(0),
  lockedCents:    bigint('locked_cents', { mode: 'number' }).notNull().default(0),
  totalDeposited: bigint('total_deposited', { mode: 'number' }).notNull().default(0),
  totalWithdrawn: bigint('total_withdrawn', { mode: 'number' }).notNull().default(0),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id:               serial('id').primaryKey(),
  userId:           integer('user_id').notNull().references(() => users.id),
  type:             transactionTypeEnum('type').notNull(),
  status:           transactionStatusEnum('status').notNull().default('pending'),
  amountCents:      bigint('amount_cents', { mode: 'number' }).notNull(),
  balanceBefore:    bigint('balance_before', { mode: 'number' }).notNull(),
  balanceAfter:     bigint('balance_after', { mode: 'number' }).notNull(),
  mpesaRef:         varchar('mpesa_ref', { length: 50 }),
  checkoutRequestId: varchar('checkout_request_id', { length: 100 }),
  mpesaPhone:       varchar('mpesa_phone', { length: 20 }),
  gameId:           integer('game_id'),
  betId:            integer('bet_id'),
  description:      text('description'),
  failureReason:    text('failure_reason'),
  processedAt:      timestamp('processed_at'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
});

export const mpesaCallbacks = pgTable('mpesa_callbacks', {
  id:                serial('id').primaryKey(),
  checkoutRequestId: varchar('checkout_request_id', { length: 100 }).notNull().unique(),
  merchantRequestId: varchar('merchant_request_id', { length: 100 }),
  resultCode:        integer('result_code').notNull(),
  resultDesc:        text('result_desc'),
  mpesaReceiptNumber: varchar('mpesa_receipt_number', { length: 50 }),
  amountCents:       bigint('amount_cents', { mode: 'number' }),
  phoneNumber:       varchar('phone_number', { length: 20 }),
  rawPayload:        text('raw_payload').notNull(),
  processed:         boolean('processed').notNull().default(false),
  processedAt:       timestamp('processed_at'),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
});

export const insertWalletSchema      = createInsertSchema(wallets);
export const selectWalletSchema      = createSelectSchema(wallets);
export const insertTransactionSchema = createInsertSchema(transactions);
export const selectTransactionSchema = createSelectSchema(transactions);
export const insertCallbackSchema    = createInsertSchema(mpesaCallbacks);

export type Wallet      = typeof wallets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type MpesaCallback = typeof mpesaCallbacks.$inferSelect;
