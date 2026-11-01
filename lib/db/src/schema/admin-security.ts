import {
  pgTable, bigserial, serial, integer, varchar, char, timestamp,
  boolean, jsonb, uuid, inet, text,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const adminAuditLog = pgTable("admin_audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  adminUserId: integer("admin_user_id").notNull().references(() => users.id),
  action: varchar("action", { length: 120 }).notNull(),
  targetType: varchar("target_type", { length: 80 }),
  targetId: varchar("target_id", { length: 120 }),
  outcome: varchar("outcome", { length: 24 }).notNull().default("success"),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  details: jsonb("details").notNull().default({}),
  previousHash: char("previous_hash", { length: 64 }),
  entryHash: char("entry_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminMfaChallenges = pgTable("admin_mfa_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: char("code_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
