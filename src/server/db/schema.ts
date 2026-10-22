import {
  boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Tên đăng nhập, viết thường, dùng trong URL hồ sơ. */
    username: varchar("username", { length: 20 }).notNull().unique(),
    displayName: varchar("display_name", { length: 32 }).notNull(),
    /** "!" = không đăng nhập bằng mật khẩu được (khách, tài khoản chỉ dùng Google/Facebook). */
    passwordHash: text("password_hash").notNull(),
    email: varchar("email", { length: 254 }).unique(),
    emailVerifiedAt: ts("email_verified_at"),
    isGuest: boolean("is_guest").notNull().default(false),
    /** "user" | "admin" */
    role: varchar("role", { length: 10 }).notNull().default("user"),
    bannedUntil: ts("banned_until"),
    banReason: text("ban_reason"),
    rating: integer("rating").notNull().default(1500),
    peakRating: integer("peak_rating").notNull().default(1500),
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    coins: integer("coins").notNull().default(0),
    vipUntil: ts("vip_until"),
    avatar: varchar("avatar", { length: 24 }).notNull().default("tuong-do"),
    frame: varchar("frame", { length: 24 }).notNull().default("none"),
    boardSkin: varchar("board_skin", { length: 24 }).notNull().default("go"),
    pieceSkin: varchar("piece_skin", { length: 24 }).notNull().default("wood"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("users_rating_idx").on(t.rating)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 của token trong cookie; token gốc không được lưu. */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Liên kết tài khoản Google/Facebook. */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: varchar("provider", { length: 16 }).notNull(),
    providerUserId: varchar("provider_user_id", { length: 128 }).notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerUserId] }), index("oauth_user_idx").on(t.userId)],
);

/** Mã một lần gửi qua email: khôi phục mật khẩu, xác nhận email. Chỉ lưu SHA-256 của mã. */
export const emailTokens = pgTable("email_tokens", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** "reset" | "verify" */
  kind: varchar("kind", { length: 12 }).notNull(),
  email: varchar("email", { length: 254 }),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Sổ cái xu: mọi thay đổi số xu đều ghi một dòng. `ref` + `reason` chống nhận thưởng hai lần. */
export const coinTransactions = pgTable(
  "coin_transactions",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: varchar("reason", { length: 32 }).notNull(),
    ref: varchar("ref", { length: 64 }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coin_tx_once_idx").on(t.userId, t.reason, t.ref), index("coin_tx_user_idx").on(t.userId, t.createdAt)],
);

export const puzzleProgress = pgTable(
  "puzzle_progress",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    puzzleId: varchar("puzzle_id", { length: 40 }).notNull(),
    stars: integer("stars").notNull(),
    attempts: integer("attempts").notNull(),
    solvedAt: ts("solved_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.puzzleId] })],
);

/** Vật phẩm đã sở hữu (bàn cờ, quân cờ, khung avatar). */
export const userItems = pgTable(
  "user_items",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    itemId: varchar("item_id", { length: 24 }).notNull(),
    acquiredAt: ts("acquired_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

export const payments = pgTable(
  "payments",
  {
    /** Mã giao dịch gửi sang cổng thanh toán. */
    id: varchar("id", { length: 24 }).primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    product: varchar("product", { length: 32 }).notNull(),
    /** Số tiền (VND). */
    amount: integer("amount").notNull(),
    provider: varchar("provider", { length: 16 }).notNull(),
    /** "pending" | "paid" | "failed" */
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    providerRef: varchar("provider_ref", { length: 64 }),
    raw: jsonb("raw"),
    createdAt: ts("created_at").notNull().defaultNow(),
    paidAt: ts("paid_at"),
  },
  (t) => [index("payments_user_idx").on(t.userId, t.createdAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetId: uuid("target_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    gameId: varchar("game_id", { length: 12 }),
    reason: varchar("reason", { length: 32 }).notNull(),
    note: text("note"),
    /** "open" | "resolved" | "dismissed" */
    status: varchar("status", { length: 12 }).notNull().default("open"),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: ts("resolved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt)],
);

/** Ván đang diễn ra, lưu lại sau mỗi thay đổi để khôi phục khi máy chủ khởi động lại. */
export const liveGames = pgTable("live_games", {
  id: varchar("id", { length: 12 }).primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export interface StoredMove {
  from: number;
  to: number;
  /** Cờ úp: quân thật được lật ra ở nước này (nếu là quân úp). */
  reveal?: string;
}

export const games = pgTable(
  "games",
  {
    id: varchar("id", { length: 12 }).primaryKey(),
    redId: uuid("red_id").notNull().references(() => users.id),
    blackId: uuid("black_id").notNull().references(() => users.id),
    minutes: integer("minutes").notNull(),
    increment: integer("increment").notNull().default(0),
    /** "xiangqi" | "jieqi" (cờ úp) */
    variant: varchar("variant", { length: 10 }).notNull().default("xiangqi"),
    rated: boolean("rated").notNull().default(true),
    tournamentId: varchar("tournament_id", { length: 12 }),
    /** "r" | "b"; null = hòa. */
    winner: varchar("winner", { length: 1 }),
    reason: varchar("reason", { length: 20 }).notNull(),
    moves: jsonb("moves").$type<StoredMove[]>().notNull(),
    /** Cờ úp: thế bày quân úp ban đầu. */
    setup: jsonb("setup"),
    plies: integer("plies").notNull(),
    redRatingBefore: integer("red_rating_before").notNull(),
    blackRatingBefore: integer("black_rating_before").notNull(),
    redRatingAfter: integer("red_rating_after").notNull(),
    blackRatingAfter: integer("black_rating_after").notNull(),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at").notNull(),
  },
  (t) => [
    index("games_red_idx").on(t.redId, t.endedAt),
    index("games_black_idx").on(t.blackId, t.endedAt),
    index("games_ended_idx").on(t.endedAt),
    index("games_tournament_idx").on(t.tournamentId),
  ],
);

export const gameAnalysis = pgTable(
  "game_analysis",
  {
    gameId: varchar("game_id", { length: 12 }).primaryKey().references(() => games.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    evals: jsonb("evals").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("game_analysis_version_idx").on(t.version)],
);

/** Thống kê lượt phân tích hàng ngày để kiểm tra quota trên máy chủ (user mỗi ngày, khách theo IP). */
export const analysisUsage = pgTable(
  "analysis_usage",
  {
    /** "user:<userId>:<YYYY-MM-DD>" hoặc "ip:<ip>:<YYYY-MM-DD>" */
    key: varchar("key", { length: 80 }).primaryKey(),
    count: integer("count").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
);

export const tournaments = pgTable(
  "tournaments",
  {
    id: varchar("id", { length: 12 }).primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    minutes: integer("minutes").notNull(),
    increment: integer("increment").notNull().default(0),
    variant: varchar("variant", { length: 10 }).notNull().default("xiangqi"),
    /** "scheduled" | "running" | "finished" */
    status: varchar("status", { length: 12 }).notNull().default("scheduled"),
    /** Xu thưởng theo hạng: [hạng 1, hạng 2, …]. */
    prizes: jsonb("prizes").$type<number[]>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("tournaments_starts_idx").on(t.startsAt)],
);

export const tournamentPlayers = pgTable(
  "tournament_players",
  {
    tournamentId: varchar("tournament_id", { length: 12 }).notNull().references(() => tournaments.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    games: integer("games").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    ratingAtJoin: integer("rating_at_join").notNull(),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.userId] }), index("tp_score_idx").on(t.tournamentId, t.score)],
);

/** Mùa giải (theo tháng, "2026-10") đã trao thưởng — để không trao hai lần. */
export const seasonRewards = pgTable("season_rewards", {
  season: varchar("season", { length: 7 }).primaryKey(),
  awardedAt: ts("awarded_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type GameAnalysis = typeof gameAnalysis.$inferSelect;
export type AnalysisUsage = typeof analysisUsage.$inferSelect;


export interface StageStoredMove {
  from: number;
  to: number;
  notation?: string;
}

export interface StagePlayerInfo {
  name: string;
  points?: string;
  title?: string;
  stars?: number;
  avatarUrl?: string;
}

export const stageGames = pgTable(
  "stage_games",
  {
    id: varchar("id", { length: 12 }).primaryKey(),
    /** SHA-256 hex (64 ký tự) của khóa phòng livestream. */
    ownerKey: varchar("owner_key", { length: 64 }).notNull(),
    /** Gắn với user nếu streamer đã đăng nhập lúc dẫn ván. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Trang nguồn ("manual", "ziga", "cotuong", v.v.). */
    site: varchar("site", { length: 32 }).notNull().default("manual"),
    round: integer("round"),
    /** Ngày thi đấu theo giờ VN: "YYYY-MM-DD". */
    playedOn: varchar("played_on", { length: 10 }).notNull(),
    /** "r" | "b" - Phe ngồi dưới (streamer). */
    mySide: varchar("my_side", { length: 1 }).notNull().default("r"),
    me: jsonb("me").$type<StagePlayerInfo>().notNull(),
    opponent: jsonb("opponent").$type<StagePlayerInfo>().notNull(),
    /** "win" | "draw" | "loss" | null */
    result: varchar("result", { length: 8 }),
    /** "manual" | "board" | null */
    resultSource: varchar("result_source", { length: 16 }),
    startFen: text("start_fen").notNull(),
    moves: jsonb("moves").$type<StageStoredMove[]>().notNull(),
    plies: integer("plies").notNull(),
    timeControl: varchar("time_control", { length: 32 }),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at").notNull(),
  },
  (t) => [
    index("stage_games_owner_ended_idx").on(t.ownerKey, t.endedAt),
    index("stage_games_user_ended_idx").on(t.userId, t.endedAt),
    index("stage_games_played_on_idx").on(t.ownerKey, t.playedOn),
  ],
);

export const stageGameAnalysis = pgTable(
  "stage_game_analysis",
  {
    gameId: varchar("game_id", { length: 12 })
      .primaryKey()
      .references(() => stageGames.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    evals: jsonb("evals").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("stage_game_analysis_version_idx").on(t.version)],
);

export type StageGame = typeof stageGames.$inferSelect;
export type StageGameInsert = typeof stageGames.$inferInsert;
export type StageGameAnalysis = typeof stageGameAnalysis.$inferSelect;
