// Server game qua WebSocket: xác thực, ghép cặp, điều phối các ván, phát trạng thái cho người chơi và người xem.

import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { Side } from "@/lib/xiangqi/engine";
import {
  WS_PATH, parseClientMessage,
  type ClientMessage, type LobbyStats, type PlayerInfo, type ServerMessage, type TimeControl,
} from "@/lib/online/protocol";
import { SESSION_COOKIE, getUserBySession, parseCookies } from "../auth";
import type { Database } from "../db";
import { saveFinishedGame } from "./persist";
import { GameRoom, type RoomTimings } from "./room";

const SIDES: Side[] = ["r", "b"];
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface Conn {
  user: PlayerInfo | null;
  watching: Set<string>;
  alive: boolean;
  tokens: number;
  refilledAt: number;
}

interface QueueEntry {
  user: PlayerInfo;
  since: number;
}

export interface GameServerOptions {
  db: Database;
  now?: () => number;
  tickMs?: number;
  timings?: Partial<RoomTimings>;
  /** Giữ ván đã xong trong RAM bao lâu để người chơi còn xem được kết quả (sau đó đọc từ DB). */
  endedRoomTtlMs?: number;
  /** Origin khác host được phép mở WebSocket (mặc định chỉ cho phép cùng host). */
  allowedOrigins?: string[];
  log?: (message: string, err?: unknown) => void;
}

export class GameServer {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  private readonly conns = new Map<WebSocket, Conn>();
  private readonly userSockets = new Map<string, Set<WebSocket>>();
  private readonly rooms = new Map<string, GameRoom>();
  private readonly finalized = new Set<string>();
  private readonly activeGame = new Map<string, string>();
  private readonly queues = new Map<TimeControl, QueueEntry[]>();
  private readonly watchers = new Map<string, Set<WebSocket>>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly now: () => number;
  private readonly log: (message: string, err?: unknown) => void;

  constructor(private readonly opts: GameServerOptions) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((message, err) => console.error(`[game] ${message}`, err ?? ""));
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
  }

  async close() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const ws of this.conns.keys()) ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
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

  private onConnection(ws: WebSocket, user: PlayerInfo | null) {
    const conn: Conn = { user, watching: new Set(), alive: true, tokens: 20, refilledAt: this.now() };
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
    const queued = user ? this.findQueued(user.id) : null;
    if (queued) this.send(ws, { t: "queue", minutes: queued.minutes, since: queued.entry.since });
  }

  private onClose(ws: WebSocket, conn: Conn) {
    this.conns.delete(ws);
    for (const gameId of conn.watching) {
      this.watchers.get(gameId)?.delete(ws);
    }
    if (conn.user) {
      const set = this.userSockets.get(conn.user.id);
      set?.delete(ws);
      if (!set?.size) {
        this.userSockets.delete(conn.user.id);
        this.dequeue(conn.user.id, false);
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

    const user = conn.user;
    if (!user) {
      this.send(ws, { t: "error", message: "Bạn cần đăng nhập để chơi online." });
      return;
    }
    switch (msg.t) {
      case "queue":
        return this.enqueue(user, msg.minutes);
      case "cancelQueue":
        return this.dequeue(user.id, true);
      default:
        return this.act(ws, user, msg);
    }
  }

  private act(ws: WebSocket, user: PlayerInfo, msg: Extract<ClientMessage, { t: "move" | "resign" | "abort" | "draw" }>) {
    const room = this.rooms.get(msg.gameId);
    if (!room) {
      this.send(ws, { t: "notFound", gameId: msg.gameId });
      return;
    }
    const now = this.now();
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
    }
    if (error) {
      this.send(ws, { t: "error", message: error });
      this.send(ws, { t: "game", game: room.snapshot(now) });
    }
    this.changed(room);
  }

  // ---- Ghép cặp ----

  private findQueued(userId: string): { minutes: TimeControl; entry: QueueEntry } | null {
    for (const [minutes, queue] of this.queues) {
      const entry = queue.find((e) => e.user.id === userId);
      if (entry) return { minutes, entry };
    }
    return null;
  }

  private enqueue(user: PlayerInfo, minutes: TimeControl) {
    const active = this.activeGame.get(user.id);
    if (active) {
      this.sendUser(user.id, { t: "matched", gameId: active });
      return;
    }
    this.dequeue(user.id, false);
    const queue = this.queues.get(minutes) ?? [];
    this.queues.set(minutes, queue);
    // Hàng đợi theo thứ tự đến trước; khi đông người có thể ưu tiên Elo gần nhau.
    const opponent = queue.shift();
    if (opponent) {
      this.sendUser(opponent.user.id, { t: "queue", minutes: null, since: null });
      this.createRoom(opponent.user, user, minutes);
      return;
    }
    const since = this.now();
    queue.push({ user, since });
    this.sendUser(user.id, { t: "queue", minutes, since });
  }

  private dequeue(userId: string, notify: boolean) {
    for (const [minutes, queue] of this.queues) {
      this.queues.set(minutes, queue.filter((e) => e.user.id !== userId));
    }
    if (notify) this.sendUser(userId, { t: "queue", minutes: null, since: null });
  }

  private createRoom(a: PlayerInfo, b: PlayerInfo, minutes: TimeControl) {
    const [red, black] = Math.random() < 0.5 ? [a, b] : [b, a];
    let id = this.newId();
    while (this.rooms.has(id)) id = this.newId();
    const room = new GameRoom(id, { r: red, b: black }, minutes, this.now(), { timings: this.opts.timings });
    this.rooms.set(id, room);
    this.activeGame.set(red.id, id);
    this.activeGame.set(black.id, id);
    this.sendUser(red.id, { t: "matched", gameId: id });
    this.sendUser(black.id, { t: "matched", gameId: id });
  }

  private newId(): string {
    return Array.from(randomBytes(8), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
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
  }

  private changed(room: GameRoom) {
    this.broadcast(room);
    if (room.status === "playing" || this.finalized.has(room.id)) return;
    this.finalized.add(room.id);
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
        })
        .catch((err) => this.log(`Không lưu được ván ${room.id}`, err));
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

  private stats(): LobbyStats {
    let anonymous = 0;
    for (const conn of this.conns.values()) if (!conn.user) anonymous++;
    let playing = 0;
    for (const room of this.rooms.values()) if (room.status === "playing") playing++;
    return { online: this.userSockets.size + anonymous, playing };
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  private sendUser(userId: string, msg: ServerMessage) {
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

  private every(ms: number, fn: () => void) {
    const t = setInterval(fn, ms);
    t.unref?.();
    this.timers.add(t);
  }

  private after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    this.timers.add(t);
  }
}
