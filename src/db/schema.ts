import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Persisted wargame matches. The authoritative record is the deterministic
 * command log: replaying `commands` against the scenario seed reproduces the
 * exact game state. A lightweight `summary` snapshot is stored for fast list
 * views and end-of-game reports.
 */
export const matches = pgTable("matches", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  scenarioId: text("scenario_id").notNull(),
  status: text("status").notNull().default("active"),
  turn: integer("turn").notNull().default(1),
  date: text("date"),
  activeSide: text("active_side"),
  winner: text("winner"),
  resultType: text("result_type"),
  commands: jsonb("commands").notNull().default([]),
  summary: jsonb("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MatchRow = typeof matches.$inferSelect;
export type NewMatchRow = typeof matches.$inferInsert;
