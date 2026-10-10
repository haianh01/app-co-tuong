// Server game qua WebSocket: xác thực, ghép cặp, điều phối các ván, phát trạng thái cho người chơi và người xem.

import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { and, eq, inArray } from "drizzle-orm";
import { WebSocket, WebSocketServer } from "ws";
import type { Side } from "@/lib/xiangqi/engine";
import {
  WS_PATH, findTimeControl, parseClientMessage,
  type ChallengeColor, type ClientMessage, type LiveGameSummary, type LobbyStats, type PlayerInfo, type QueueKey, type ServerMessage, type Variant,
} from "@/lib/online/protocol";
import { SESSION_COOKIE, getUserById, getUserBySession, isBanned, parseCookies, toPlayerInfo, type AuthUser } from "../auth";
import type { Database } from "../db";
import { tournamentPlayers } from "../db/schema";
import { advanceTournaments, ensureSchedule, joinTournament, runningTournaments } from "../tournaments";
import { ArenaPool } from "./arena";
import { ChallengeBook } from "./challenges";
import { Matchmaker } from "./matchmaker";
import { saveFinishedGame } from "./persist";
import { registerGameServer, type GameServerHandle } from "./registry";
import { GameRoom, type RoomOptions, type RoomTimings } from "./room";
import { LiveStore } from "./store";

const SIDES: Side[] = ["r", "b"];
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHAT_INTERVAL_MS = 1500;

interface Conn {
  user: PlayerInfo | null;
  banned: boolean;
  watching: Set<string>;
  alive: boolean;
  tokens: number;
  refilledAt: number;
}

export interface GameServerOptions {
  db: Database;
  now?: () => number;
  tickMs?: number;
  timings?: Partial<RoomTimings>;
  /** Giữ ván đã xong trong RAM bao lâu để người chơi còn xem kết quả / mời đấu lại (sau đó đọc từ DB). */
  endedRoomTtlMs?: number;
  /** Origin khác host được phép mở WebSocket (mặc định chỉ cho phép cùng host). */
  allowedOrigins?: string[];
  log?: (message: string, err?: unknown) => void;
}

/** Ván mới do các tính năng khác tạo (đấu lại, phòng bạn bè, giải đấu). */
export interface NewRoom {
  players: [PlayerInfo, PlayerInfo];
  /** Phe của người thứ nhất; không truyền thì chia ngẫu nhiên. */
  firstSide?: Side;
  minutes: number;
  options: Omit<RoomOptions, "timings">;
}

export class GameServer implements GameServerHandle {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  private readonly conns = new Map<WebSocket, Conn>();
  private readonly userSockets = new Map<string, Set<WebSocket>>();
  readonly rooms = new Map<string, GameRoom>();
  private readonly finalized = new Set<string>();
  private readonly activeGame = new Map<string, string>();
  private readonly matchmaker = new Matchmaker();
  private readonly challenges = new ChallengeBook();
  readonly arena = new ArenaPool();
  private readonly arenaWatchers = new Map<string, Set<WebSocket>>();
  private readonly watchers = new Map<string, Set<WebSocket>>();
  private readonly lastChat = new Map<string, number>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly store: LiveStore;
  private readonly now: () => number;
  private readonly log: (message: string, err?: unknown) => void;
  /** Gọi khi một ván kết thúc và đã lưu (giải đấu dùng để ghép ván tiếp). */
  onRoomFinished?: (room: GameRoom) => void;

  constructor(private readonly opts: GameServerOptions) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((message, err) => console.error(`[game] ${message}`, err ?? ""));
    this.store = new LiveStore(opts.db, this.log);
  }

  /** Gắn vào HTTP server; chỉ nhận upgrade ở WS_PATH, các đường dẫn khác (vd. HMR của Next) để nguyên. */
  attach(server: HttpServer) {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!req.url || new URL(req.url, "http://localhost").pathname !== WS_PATH) return;
      void this.handleUpgrade(req, socket, head);
    });
    this.every(this.opts.tickMs ?? 250, () => this.tick());
    this.every(30_000, () => this.heartbeat());
    this.every(10_000, () => this.broadcastAll({ t: "stats", stats: this.stats() }));
    this.every(30_000, () => void this.syncTournaments());
    void this.syncTournaments();
    registerGameServer(this);
  }

  /** Khôi phục các ván đang chơi dở từ DB (gọi trước khi nhận kết nối). */
  async restore(): Promise<number> {
    const now = this.now();
    let count = 0;
    for (const data of await this.store.loadAll()) {
      try {
        const room = GameRoom.fromJSON(data, now, this.opts.timings);
        this.rooms.set(room.id, room);
        for (const side of SIDES) this.activeGame.set(room.players[side].id, room.id);
        count++;
      } catch (err) {
        this.log(`Không khôi phục được ván ${data.id}`, err);
        this.store.remove(data.id);
      }
    }
    return count;
  }

  async close() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    const now = this.now();
    for (const room of this.rooms.values()) if (room.status === "playing") this.store.save(room.toJSON(now));
    await this.store.flush();
    for (const ws of this.conns.keys()) ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    registerGameServer(undefined);
  }

  // ---- Kết nối ----

  private async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    try {
      if (!this.originAllowed(req)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const user = await getUserBySession(this.opts.db, token, this.now());
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, user));
    } catch (err) {
      this.log("Lỗi khi mở WebSocket", err);
      socket.destroy();
    }
  }

  /** Chặn trang web lạ mở WebSocket bằng cookie của người dùng (cross-site WebSocket hijacking). */
  private originAllowed(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // không phải trình duyệt: không mang cookie của người khác
    if (this.opts.allowedOrigins?.includes(origin)) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  private onConnection(ws: WebSocket, auth: AuthUser | null) {
    const user = auth ? toPlayerInfo(auth) : null;
    const conn: Conn = { user, banned: !!auth && isBanned(auth, this.now()), watching: new Set(), alive: true, tokens: 20, refilledAt: this.now() };
    this.conns.set(ws, conn);
    if (user) {
      const set = this.userSockets.get(user.id) ?? new Set();
      set.add(ws);
      this.userSockets.set(user.id, set);
    }
    ws.on("pong", () => {
      conn.alive = true;
    });
    ws.on("message", (data, isBinary) => {
      if (!isBinary) this.onMessage(ws, conn, data.toString());
    });
    ws.on("close", () => this.onClose(ws, conn));
    ws.on("error", (err) => this.log("Lỗi WebSocket", err));

    this.send(ws, {
      t: "hello",
      user,
      activeGameId: user ? (this.activeGame.get(user.id) ?? null) : null,
      stats: this.stats(),
    });
    const queued = user ? this.matchmaker.find(user.id) : null;
    if (queued) this.send(ws, { t: "queue", key: queued.key, since: queued.since });
    const challenge = user ? this.challenges.ofUser(user.id, this.now()) : null;
    if (challenge) this.send(ws, { t: "challenge", challenge });
  }

  private onClose(ws: WebSocket, conn: Conn) {
    this.conns.delete(ws);
    for (const set of this.arenaWatchers.values()) set.delete(ws);
    for (const gameId of conn.watching) this.watchers.get(gameId)?.delete(ws);
    if (conn.user) {
      const set = this.userSockets.get(conn.user.id);
      set?.delete(ws);
      if (!set?.size) {
        this.userSockets.delete(conn.user.id);
        this.matchmaker.remove(conn.user.id);
        this.arena.drop(conn.user.id);
      }
      for (const gameId of conn.watching) this.refreshPresence(gameId, conn.user.id);
    }
  }

  private heartbeat() {
    for (const [ws, conn] of this.conns) {
      if (!conn.alive) {
        ws.terminate();
        continue;
      }
      conn.alive = false;
      ws.ping();
    }
  }

  async refreshUser(userId: string) {
    const auth = await getUserById(this.opts.db, userId);
    if (!auth) return this.disconnectUser(userId);
    const info = toPlayerInfo(auth);
    const banned = isBanned(auth, this.now());
    for (const ws of this.userSockets.get(userId) ?? []) {
      const conn = this.conns.get(ws);
      if (conn) {
        conn.user = info;
        conn.banned = banned;
      }
    }
    this.challenges.updateUser(info);
    if (banned) {
      this.matchmaker.remove(userId);
      if (this.challenges.cancel(userId)) this.sendUser(userId, { t: "challenge", challenge: null });
    }
  }

  disconnectUser(userId: string) {
    this.matchmaker.remove(userId);
    this.challenges.cancel(userId);
    for (const ws of this.userSockets.get(userId) ?? []) ws.close(4001, "kicked");
  }

  // ---- Tin nhắn ----

  /** Mỗi kết nối tối đa ~10 tin/giây (cho phép dồn 20). */
  private allow(conn: Conn): boolean {
    const now = this.now();
    conn.tokens = Math.min(20, conn.tokens + (now - conn.refilledAt) / 100);
    conn.refilledAt = now;
    if (conn.tokens < 1) return false;
    conn.tokens -= 1;
    return true;
  }

  private onMessage(ws: WebSocket, conn: Conn, raw: string) {
    if (!this.allow(conn)) {
      this.send(ws, { t: "error", message: "Bạn thao tác quá nhanh, vui lòng chậm lại." });
      return;
    }
    const msg = parseClientMessage(raw);
    if (!msg) {
      this.send(ws, { t: "error", message: "Tin nhắn không hợp lệ." });
      return;
    }
    if (msg.t === "watch") return this.watch(ws, conn, msg.gameId);
    if (msg.t === "unwatch") return this.unwatch(ws, conn, msg.gameId);
    if (msg.t === "challengeInfo") return this.challengeInfo(ws, msg.code);
    if (msg.t === "arenaWatch") return this.watchArena(ws, msg.id);

    const user = conn.user;
    if (!user) {
      this.send(ws, { t: "error", message: "Bạn cần đăng nhập để chơi online." });
      return;
    }
    switch (msg.t) {
      case "queue":
        return this.enqueue(ws, conn, user, msg);
      case "cancelQueue":
        this.matchmaker.remove(user.id);
        this.sendUser(user.id, { t: "queue", key: null, since: null });
        return;
      case "rematch":
        return this.rematch(ws, conn, user, msg.gameId, msg.action);
      case "challengeCreate":
        return this.createChallenge(ws, conn, user, msg, msg.color);
      case "challengeCancel":
        this.challenges.cancel(user.id);
        this.sendUser(user.id, { t: "challenge", challenge: null });
        return;
      case "challengeAccept":
        return this.acceptChallenge(ws, conn, user, msg.code);
      case "arenaJoin":
        return void this.joinArena(ws, conn, user, msg.id);
      case "arenaLeave":
        this.arena.unready(msg.id, user.id);
        this.sendUser(user.id, { t: "arena", id: msg.id, ready: false });
        return;
      default:
        return this.act(ws, user, msg);
    }
  }

  private act(ws: WebSocket, user: PlayerInfo, msg: Extract<ClientMessage, { t: "move" | "resign" | "abort" | "draw" | "chat" }>) {
    const room = this.rooms.get(msg.gameId);
    if (!room) {
      this.send(ws, { t: "notFound", gameId: msg.gameId });
      return;
    }
    const now = this.now();
    const statusBefore = room.status;
    let error: string | null;
    switch (msg.t) {
      case "move":
        // Client đang lệch trạng thái (vd. vừa mất mạng): gửi lại toàn bộ để đồng bộ.
        if (msg.ply !== room.plies) {
          this.send(ws, { t: "game", game: room.snapshot(now) });
          return;
        }
        error = room.move(user.id, { from: msg.from, to: msg.to }, now);
        break;
      case "resign":
        error = room.resign(user.id, now);
        break;
      case "abort":
        error = room.abort(user.id, now);
        break;
      case "draw":
        error = room.draw(user.id, msg.action, now);
        break;
      case "chat": {
        const last = this.lastChat.get(user.id) ?? 0;
        if (now - last < CHAT_INTERVAL_MS) return;
        this.lastChat.set(user.id, now);
        error = room.say(user.id, msg.phrase, now);
        break;
      }
    }
    if (error) {
      this.send(ws, { t: "error", message: error });
      this.send(ws, { t: "game", game: room.snapshot(now) });
      // Lỗi nhưng ván vẫn có thể vừa kết thúc (vd. hết giờ đúng lúc đi).
      if (room.status !== statusBefore) this.changed(room);
      return;
    }
    this.changed(room);
  }

  // ---- Ghép cặp ----

  private enqueue(ws: WebSocket, conn: Conn, user: PlayerInfo, key: QueueKey) {
    const blocked = this.playBlock(conn, user, key);
    if (blocked) {
      this.send(ws, { t: "error", message: blocked });
      return;
    }
    const active = this.activeGame.get(user.id);
    if (active) {
      this.sendUser(user.id, { t: "matched", gameId: active });
      return;
    }
    const entry = this.matchmaker.add(user, { variant: key.variant, tc: key.tc, rated: key.rated }, this.now());
    this.sendUser(user.id, { t: "queue", key: entry.key, since: entry.since });
    this.pairQueue();
  }

  /** Cho phép mở thêm biến thể (cờ úp đăng ký khi được nạp). */
  variantEnabled = (variant: Variant) => variant === "xiangqi";

  private pairQueue() {
    for (const [a, b] of this.matchmaker.takePairs(this.now())) {
      const tc = findTimeControl(a.key.tc)!;
      for (const e of [a, b]) this.sendUser(e.user.id, { t: "queue", key: null, since: null });
      this.createRoom({
        players: [a.user, b.user],
        minutes: tc.minutes,
        options: { increment: tc.increment, rated: a.key.rated, variant: a.key.variant },
      });
    }
  }

  /** Tạo ván mới và báo cho hai người chơi. Trả về null nếu một người đang có ván khác. */
  createRoom({ players: [a, b], firstSide, minutes, options }: NewRoom): GameRoom | null {
    if (this.activeGame.has(a.id) || this.activeGame.has(b.id)) return null;
    const aSide: Side = firstSide ?? (Math.random() < 0.5 ? "r" : "b");
    const players = aSide === "r" ? { r: a, b } : { r: b, b: a };
    let id = this.newId();
    while (this.rooms.has(id)) id = this.newId();
    const room = new GameRoom(id, players, minutes, this.now(), { ...options, timings: this.opts.timings });
    this.rooms.set(id, room);
    this.activeGame.set(a.id, id);
    this.activeGame.set(b.id, id);
    this.store.save(room.toJSON(this.now()));
    this.sendUser(a.id, { t: "matched", gameId: id });
    this.sendUser(b.id, { t: "matched", gameId: id });
    return room;
  }

  isBusy(userId: string): boolean {
    return this.activeGame.has(userId);
  }

  private newId(): string {
    return Array.from(randomBytes(8), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
  }

  // ---- Phòng bạn bè ----

  /** Lý do không được chơi (bị khóa, khách đòi ván tính điểm, chế độ chưa mở); null nếu được. */
  private playBlock(conn: Conn, user: PlayerInfo, key: QueueKey): string | null {
    if (conn.banned) return "Tài khoản của bạn đang bị khóa chơi online.";
    if (key.rated && user.isGuest) return "Khách chỉ chơi được ván không tính điểm. Hãy tạo tài khoản để đấu xếp hạng.";
    if (key.variant !== "xiangqi" && !this.variantEnabled(key.variant)) return "Chế độ chơi này chưa mở.";
    return null;
  }

  private createChallenge(ws: WebSocket, conn: Conn, user: PlayerInfo, key: QueueKey, color: ChallengeColor) {
    const blocked = this.playBlock(conn, user, key);
    if (blocked) {
      this.send(ws, { t: "error", message: blocked });
      return;
    }
    const active = this.activeGame.get(user.id);
    if (active) {
      this.sendUser(user.id, { t: "matched", gameId: active });
      return;
    }
    const challenge = this.challenges.create(user, { variant: key.variant, tc: key.tc, rated: key.rated }, color, this.now());
    this.sendUser(user.id, { t: "challenge", challenge });
  }

  private challengeInfo(ws: WebSocket, code: string) {
    const challenge = this.challenges.get(code, this.now());
    this.send(ws, { t: "challengeInfo", code, challenge, online: !!challenge && this.userSockets.has(challenge.by.id) });
  }

  private acceptChallenge(ws: WebSocket, conn: Conn, user: PlayerInfo, code: string) {
    const c = this.challenges.get(code, this.now());
    const fail = (message: string) => this.send(ws, { t: "error", message });
    if (!c) return fail("Lời mời không tồn tại hoặc đã hết hạn.");
    if (c.by.id === user.id) return fail("Đây là lời mời của chính bạn. Hãy gửi link cho bạn bè.");
    const blocked = this.playBlock(conn, user, c);
    if (blocked) return fail(blocked);
    const active = this.activeGame.get(user.id);
    if (active) {
      this.sendUser(user.id, { t: "matched", gameId: active });
      return;
    }
    // Người mời phải đang mở trang: nếu không, ván sẽ bị hủy vì không ai đi nước đầu.
    if (!this.userSockets.has(c.by.id)) return fail("Người mời hiện không trực tuyến. Hãy nhắn họ mở lại trang Kỳ Đài.");
    if (this.activeGame.has(c.by.id)) return fail("Người mời đang chơi một ván khác, hãy thử lại sau.");

    this.challenges.cancel(c.by.id);
    for (const id of [c.by.id, user.id]) {
      if (this.matchmaker.remove(id)) this.sendUser(id, { t: "queue", key: null, since: null });
    }
    this.sendUser(c.by.id, { t: "challenge", challenge: null });
    const tc = findTimeControl(c.tc)!;
    this.createRoom({
      players: [c.by, user],
      firstSide: c.color === "random" ? undefined : c.color,
      minutes: tc.minutes,
      options: { increment: tc.increment, rated: c.rated, variant: c.variant },
    });
  }

  // ---- Giải Arena ----

  /** Tạo lịch giải, chuyển trạng thái theo giờ, nạp các giải đang chạy vào bộ ghép cặp. */
  async syncTournaments() {
    try {
      const now = this.now();
      await ensureSchedule(this.opts.db, now);
      const busy = new Set<string>();
      for (const room of this.rooms.values()) if (room.status === "playing" && room.tournamentId) busy.add(room.tournamentId);
      const { started, finished } = await advanceTournaments(this.opts.db, now, busy);
      const running = await runningTournaments(this.opts.db);
      this.arena.sync(
        running.map((t) => ({ id: t.id, minutes: t.minutes, increment: t.increment, variant: t.variant, endsAt: t.endsAt.getTime() })),
      );
      for (const id of [...started, ...finished]) this.arenaUpdate(id);
    } catch (err) {
      this.log("Không cập nhật được giải đấu", err);
    }
  }

  private watchArena(ws: WebSocket, id: string) {
    const set = this.arenaWatchers.get(id) ?? new Set();
    set.add(ws);
    this.arenaWatchers.set(id, set);
    const user = this.conns.get(ws)?.user;
    if (user) this.send(ws, { t: "arena", id, ready: this.arena.isReady(id, user.id) });
  }

  private async joinArena(ws: WebSocket, conn: Conn, user: PlayerInfo, id: string) {
    if (conn.banned) {
      this.send(ws, { t: "error", message: "Tài khoản của bạn đang bị khóa chơi online." });
      return;
    }
    const res = await joinTournament(this.opts.db, id, user.id, this.now());
    if (!res.ok) {
      this.send(ws, { t: "error", message: res.error });
      return;
    }
    const [row] = await this.opts.db
      .select({ score: tournamentPlayers.score })
      .from(tournamentPlayers)
      .where(and(eq(tournamentPlayers.tournamentId, id), eq(tournamentPlayers.userId, user.id)));
    if (!this.userSockets.has(user.id)) return; // Đã rời mạng trong lúc chờ DB.
    this.arena.setReady(id, conn.user ?? user, row?.score ?? 0);
    this.watchArena(ws, id);
    this.sendUser(user.id, { t: "arena", id, ready: true });
    this.arenaUpdate(id);
  }

  private pairArenas() {
    const pairs = this.arena.pair(this.now(), (id) => this.userSockets.has(id) && !this.activeGame.has(id));
    for (const p of pairs) {
      this.createRoom({
        players: [p.red, p.black],
        firstSide: "r",
        minutes: p.arena.minutes,
        options: { increment: p.arena.increment, rated: true, variant: p.arena.variant as Variant, tournamentId: p.arena.id },
      });
    }
  }

  /** Ván giải đấu vừa xong: cập nhật điểm trong bộ ghép cặp và báo các trang đang xem giải. */
  private async arenaGameDone(room: GameRoom) {
    const id = room.tournamentId!;
    const ids = [room.players.r.id, room.players.b.id];
    const rows = await this.opts.db
      .select({ userId: tournamentPlayers.userId, score: tournamentPlayers.score })
      .from(tournamentPlayers)
      .where(and(eq(tournamentPlayers.tournamentId, id), inArray(tournamentPlayers.userId, ids)));
    this.arena.finished(id, ids[0], ids[1], Object.fromEntries(rows.map((r) => [r.userId, r.score])), this.now());
    this.arenaUpdate(id);
  }

  private arenaUpdate(id: string) {
    const data = JSON.stringify({ t: "arenaUpdate", id } satisfies ServerMessage);
    for (const ws of this.arenaWatchers.get(id) ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }

  // ---- Đấu lại ----

  private rematch(ws: WebSocket, conn: Conn, user: PlayerInfo, gameId: string, action: "offer" | "accept" | "decline") {
    const room = this.rooms.get(gameId);
    if (!room) {
      this.send(ws, { t: "notFound", gameId });
      return;
    }
    if (conn.banned) {
      this.send(ws, { t: "error", message: "Tài khoản của bạn đang bị khóa chơi online." });
      return;
    }
    const outcome = room.rematchAction(user.id, action);
    if (outcome === "start") {
      const side = room.sideOf(user.id)!;
      const me = room.players[side];
      const them = room.players[side === "r" ? "b" : "r"];
      // Đổi màu quân so với ván trước.
      const next = this.createRoom({
        players: [me, them],
        firstSide: side === "r" ? "b" : "r",
        minutes: room.minutes,
        options: { increment: room.increment, rated: room.rated, variant: room.variant },
      });
      if (!next) {
        this.send(ws, { t: "error", message: "Một trong hai người đang ở ván khác." });
        return;
      }
      room.rematch = { offeredBy: null, gameId: next.id };
    } else if (outcome) {
      this.send(ws, { t: "error", message: outcome });
      return;
    }
    this.broadcast(room);
  }

  // ---- Theo dõi ván ----

  private watch(ws: WebSocket, conn: Conn, gameId: string) {
    const room = this.rooms.get(gameId);
    if (!room) {
      this.send(ws, { t: "notFound", gameId });
      return;
    }
    conn.watching.add(gameId);
    const set = this.watchers.get(gameId) ?? new Set();
    set.add(ws);
    this.watchers.set(gameId, set);
    this.send(ws, { t: "game", game: room.snapshot(this.now()) });
    if (conn.user) this.refreshPresence(gameId, conn.user.id);
  }

  private unwatch(ws: WebSocket, conn: Conn, gameId: string) {
    conn.watching.delete(gameId);
    this.watchers.get(gameId)?.delete(ws);
    if (conn.user) this.refreshPresence(gameId, conn.user.id);
  }

  /** Người chơi được coi là "có mặt" khi còn ít nhất một tab đang mở ván đó. */
  private refreshPresence(gameId: string, userId: string) {
    const room = this.rooms.get(gameId);
    const side = room?.sideOf(userId);
    if (!room || !side) return;
    const present = [...(this.userSockets.get(userId) ?? [])].some((s) => this.conns.get(s)?.watching.has(gameId));
    if (room.isConnected(side) === present) return;
    room.setConnected(side, present, this.now());
    this.changed(room);
  }

  // ---- Vòng đời ván ----

  private tick() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (room.update(now)) this.changed(room);
    }
    if (this.matchmaker.size > 1) this.pairQueue();
    this.pairArenas();
    for (const c of this.challenges.sweep(now)) this.sendUser(c.by.id, { t: "challenge", challenge: null });
  }

  private changed(room: GameRoom) {
    this.broadcast(room);
    if (room.status === "playing") {
      this.store.save(room.toJSON(this.now()));
      return;
    }
    if (this.finalized.has(room.id)) return;
    this.finalized.add(room.id);
    this.store.remove(room.id);
    for (const side of SIDES) {
      const userId = room.players[side].id;
      if (this.activeGame.get(userId) === room.id) this.activeGame.delete(userId);
    }
    if (room.status === "ended") {
      saveFinishedGame(this.opts.db, room)
        .then(({ delta, after }) => {
          room.ratingChange = delta;
          for (const side of SIDES) this.updateRating(room.players[side].id, after[side]);
          this.broadcast(room);
          if (room.tournamentId) this.arenaGameDone(room).catch((err) => this.log("Lỗi cập nhật giải", err));
          this.onRoomFinished?.(room);
        })
        .catch((err) => this.log(`Không lưu được ván ${room.id}`, err));
    } else {
      if (room.tournamentId) this.arenaGameDone(room).catch((err) => this.log("Lỗi cập nhật giải", err));
      this.onRoomFinished?.(room);
    }
    this.after(this.opts.endedRoomTtlMs ?? 10 * 60_000, () => this.removeRoom(room.id));
  }

  private removeRoom(gameId: string) {
    this.rooms.delete(gameId);
    this.finalized.delete(gameId);
    for (const ws of this.watchers.get(gameId) ?? []) this.conns.get(ws)?.watching.delete(gameId);
    this.watchers.delete(gameId);
  }

  private updateRating(userId: string, rating: number) {
    for (const ws of this.userSockets.get(userId) ?? []) {
      const conn = this.conns.get(ws);
      if (conn?.user) conn.user = { ...conn.user, rating };
    }
  }

  // ---- Gửi tin ----

  stats(): LobbyStats {
    let anonymous = 0;
    for (const conn of this.conns.values()) if (!conn.user) anonymous++;
    const live: LiveGameSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.status !== "playing") continue;
      live.push({
        id: room.id,
        variant: room.variant,
        minutes: room.minutes,
        increment: room.increment,
        rated: room.rated,
        red: { displayName: room.players.r.displayName, rating: room.players.r.rating },
        black: { displayName: room.players.b.displayName, rating: room.players.b.rating },
        plies: room.plies,
      });
    }
    live.sort((x, y) => y.red.rating + y.black.rating - (x.red.rating + x.black.rating));
    return { online: this.userSockets.size + anonymous, playing: live.length, games: live.slice(0, 8) };
  }

  send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  sendUser(userId: string, msg: ServerMessage) {
    for (const ws of this.userSockets.get(userId) ?? []) this.send(ws, msg);
  }

  private broadcast(room: GameRoom) {
    const data = JSON.stringify({ t: "game", game: room.snapshot(this.now()) } satisfies ServerMessage);
    for (const ws of this.watchers.get(room.id) ?? []) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  private broadcastAll(msg: ServerMessage) {
    const data = JSON.stringify(msg);
    for (const ws of this.conns.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }

  // ---- Hẹn giờ (gom lại để close() dọn sạch) ----

  every(ms: number, fn: () => void) {
    const t = setInterval(fn, ms);
    t.unref?.();
    this.timers.add(t);
  }

  after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    this.timers.add(t);
  }
}
