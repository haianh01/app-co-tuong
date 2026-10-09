import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Tên đăng nhập, viết thường, dùng trong URL hồ sơ. */
    username: varchar("username", { length: 20 }).notNull().unique(),
    displayName: varchar("display_name", { length: 32 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    rating: integer("rating").notNull().default(1500),
    peakRating: integer("peak_rating").notNull().default(1500),
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_rating_idx").on(t.rating)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 của token trong cookie; token gốc không được lưu. */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export interface StoredMove {
  from: number;
  to: number;
}

export const games = pgTable(
  "games",
  {
    id: varchar("id", { length: 12 }).primaryKey(),
    redId: uuid("red_id").notNull().references(() => users.id),
    blackId: uuid("black_id").notNull().references(() => users.id),
    minutes: integer("minutes").notNull(),
    rated: boolean("rated").notNull().default(true),
    /** "r" | "b"; null = hòa. */
    winner: varchar("winner", { length: 1 }),
    reason: varchar("reason", { length: 20 }).notNull(),
    moves: jsonb("moves").$type<StoredMove[]>().notNull(),
    plies: integer("plies").notNull(),
    redRatingBefore: integer("red_rating_before").notNull(),
    blackRatingBefore: integer("black_rating_before").notNull(),
    redRatingAfter: integer("red_rating_after").notNull(),
    blackRatingAfter: integer("black_rating_after").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("games_red_idx").on(t.redId, t.endedAt),
    index("games_black_idx").on(t.blackId, t.endedAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
