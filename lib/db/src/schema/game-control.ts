import { pgTable, integer, boolean, timestamp, text } from "drizzle-orm/pg-core";
export const gameControl = pgTable("game_control", {
  id: integer("id").primaryKey().default(1),
  isPaused: boolean("is_paused").notNull().default(false),
  reason: text("reason"),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
