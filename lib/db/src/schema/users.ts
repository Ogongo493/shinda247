import { pgTable, serial, varchar, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const users = pgTable('users', {
  id:           serial('id').primaryKey(),
  phone:        varchar('phone', { length: 20 }).notNull().unique(),
  username:     varchar('username', { length: 32 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  isActive:     boolean('is_active').notNull().default(true),
  isAdmin:      boolean('is_admin').notNull().default(false),
  kycVerified:  boolean('kyc_verified').notNull().default(false),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});

export const otpCodes = pgTable('otp_codes', {
  id:        serial('id').primaryKey(),
  phone:     varchar('phone', { length: 20 }).notNull(),
  code:      varchar('code', { length: 6 }).notNull(),
  attempts:  integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt:    timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id:        serial('id').primaryKey(),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token:     varchar('token', { length: 512 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertUserSchema    = createInsertSchema(users);
export const selectUserSchema    = createSelectSchema(users);
export const insertOtpSchema     = createInsertSchema(otpCodes);
export const insertSessionSchema = createInsertSchema(sessions);

export type User    = typeof users.$inferSelect;
export type OtpCode = typeof otpCodes.$inferSelect;
export type Session = typeof sessions.$inferSelect;
