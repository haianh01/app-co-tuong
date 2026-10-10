// Test tích hợp: server HTTP thật + WebSocket thật + PostgreSQL nhúng (PGlite) trong RAM.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { sq } from "@/lib/xiangqi/engine";
import type { GameSnapshot, ServerMessage } from "@/lib/online/protocol";
import { resetDb } from "@/test/db";
import { createGuest, createSession, registerUser } from "../auth";
import type { Database } from "../db";
import { games, users } from "../db/schema";
import { GameServer } from "./server";

type Msg<T extends ServerMessage["t"]> = Extract<ServerMessage, { t: T }>;

class Client {
  readonly ws: WebSocket;
  private readonly messages: ServerMessage[] = [];
  private cursor = 0;

  constructor(url: string, token?: string, origin?: string) {
    this.ws = new WebSocket(url, { headers: token ? { Cookie: `kd_session=${token}` } : {}, origin });
    this.ws.on("message", (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
  }

  opened() {
    return new Promise<void>((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
  }

  send(msg: object) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Chờ tin nhắn kế tiếp (theo thứ tự nhận) thỏa điều kiện; các tin bỏ qua được tiêu thụ. */
  waitFor<T extends ServerMessage["t"]>(t: T, pred: (m: Msg<T>) => boolean = () => true, timeout = 4000): Promise<Msg<T>> {
    return new Promise((resolve, reject) => {
      const check = () => {
        for (let i = this.cursor; i < this.messages.length; i++) {
          const m = this.messages[i];
          if (m.t === t && pred(m as Msg<T>)) {
            this.cursor = i + 1;
            return m as Msg<T>;
          }
        }
        return null;
      };
      const found = check();
      if (found) return resolve(found);
      const onMessage = () => {
        const m = check();
        if (!m) return;
        clearTimeout(timer);
        this.ws.off("message", onMessage);
        resolve(m);
      };
      const timer = setTimeout(() => {
        this.ws.off("message", onMessage);
        reject(new Error(`Không nhận được "${t}". Tin chưa xử lý: ${JSON.stringify(this.messages.slice(this.cursor))}`));
      }, timeout);
      this.ws.on("message", onMessage);
    });
  }

  game(pred: (g: GameSnapshot) => boolean = () => true) {
    return this.waitFor("game", (m) => pred(m.game)).then((m) => m.game);
  }

  close() {
    this.ws.close();
  }
}

let db: Database;
/** Đồng hồ giả của server game: test tự tua thời gian thay vì chờ thật. */
let clock = Date.UTC(2026, 9, 10, 8, 0, 0);
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
const servers: { server: GameServer; http: Server }[] = [];
let url: string;
let gs: GameServer;

async function startServer() {
  const http = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const server = new GameServer({ db, now: () => clock, tickMs: 10, timings: { firstMoveMs: 30_000, abandonMs: 60_000 }, log: () => {} });
  server.attach(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  servers.push({ server, http });
  return { server, url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws` };
}

/** Tua đồng hồ rồi chờ server chạy vòng kiểm tra kế tiếp. */
async function advance(ms: number) {
  clock += ms;
  await new Promise((resolve) => setTimeout(resolve, 40));
}

/** Chờ một điều kiện (vd. dữ liệu đã ghi xuống DB) tối đa 3 giây. */
async function waitUntil(check: () => Promise<boolean>) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Hết thời gian chờ");
}

beforeAll(async () => {
  db = await resetDb();
  for (const name of ["anh", "binh", "chi", "dung", "emma", "giang", "hoa", "khanh", "lan"]) {
    const res = await registerUser(db, { username: name, displayName: name.toUpperCase(), password: "matkhau123" });
    if (!res.ok) throw new Error(JSON.stringify(res.errors));
    ids[name] = res.user.id;
    tokens[name] = (await createSession(db, res.user.id)).token;
  }
  ({ server: gs, url } = await startServer());
});

afterAll(async () => {
  for (const { server, http } of servers) {
    await server.close();
    await new Promise((resolve) => http.close(resolve));
  }
});

async function connect(name?: string, token = name ? tokens[name] : undefined) {
  const c = new Client(url, token);
  await c.opened();
  const hello = await c.waitFor("hello");
  if (name) expect(hello.user?.username).toBe(name);
  return c;
}

/** Hai người vào hàng đợi, được ghép, cùng mở ván. Trả về [đỏ, đen, gameId]. */
async function match(p: string, q: string, tc: string, rated = true) {
  const a = await connect(p);
  const b = await connect(q);
  a.send({ t: "queue", tc, rated, variant: "xiangqi" });
  await a.waitFor("queue", (m) => m.key?.tc === tc);
  b.send({ t: "queue", tc, rated, variant: "xiangqi" });
  const { gameId } = await a.waitFor("matched");
  expect((await b.waitFor("matched")).gameId).toBe(gameId);
  a.send({ t: "watch", gameId });
  b.send({ t: "watch", gameId });
  const snap = await a.game();
  await b.game();
  return snap.players.r.id === ids[p] ? ([a, b, gameId] as const) : ([b, a, gameId] as const);
}

/** Hai nước mở đầu: Pháo 2 bình 5, Mã 8 tiến 7. */
async function open(red: Client, black: Client, gameId: string) {
  red.send({ t: "move", gameId, from: sq(7, 7), to: sq(7, 4), ply: 0 });
  await black.game((g) => g.moves.length === 1);
  black.send({ t: "move", gameId, from: sq(0, 7), to: sq(2, 6), ply: 1 });
  await red.game((g) => g.moves.length === 2);
}

describe("GameServer", () => {
  it("ghép cặp, kiểm tra nước đi, người xem, xin thua, lưu ván và Elo", async () => {
    const [red, black, gameId] = await match("anh", "binh", "10+0");

    // Đang có ván dở thì vào hàng đợi sẽ được đưa về ván đó.
    red.send({ t: "queue", tc: "5+3", rated: true, variant: "xiangqi" });
    expect((await red.waitFor("matched")).gameId).toBe(gameId);

    black.send({ t: "move", gameId, from: sq(0, 7), to: sq(2, 6), ply: 0 });
    await black.waitFor("error", (m) => /Chưa đến lượt/.test(m.message));
    await open(red, black, gameId);

    // Gửi nước với số thứ tự cũ: server không áp dụng mà gửi lại trạng thái để đồng bộ.
    red.send({ t: "move", gameId, from: sq(9, 7), to: sq(7, 6), ply: 1 });
    expect((await red.game()).moves).toHaveLength(2);

    const viewer = await connect();
    viewer.send({ t: "watch", gameId });
    const seen = await viewer.game();
    expect(seen.moves).toHaveLength(2);
    expect(seen.connected).toEqual({ r: true, b: true });
    expect(seen.rated).toBe(true);
    viewer.send({ t: "queue", tc: "10+0", rated: false, variant: "xiangqi" });
    await viewer.waitFor("error", (m) => /đăng nhập/.test(m.message));

    black.send({ t: "resign", gameId });
    const ended = await viewer.game((g) => g.status === "ended");
    expect(ended.result).toEqual({ winner: "r", reason: "resign" });
    const rated = await viewer.game((g) => g.ratingChange !== null);
    expect(rated.ratingChange).toEqual({ r: 20, b: -20 });

    const [row] = await db.select().from(games).where(eq(games.id, gameId));
    expect(row).toMatchObject({
      winner: "r", reason: "resign", plies: 2, minutes: 10, increment: 0, rated: true,
      redRatingAfter: 1520, blackRatingAfter: 1480,
    });
    const [r] = await db.select().from(users).where(eq(users.id, ended.players.r.id));
    const [b] = await db.select().from(users).where(eq(users.id, ended.players.b.id));
    expect(r).toMatchObject({ rating: 1520, peakRating: 1520, gamesPlayed: 1, wins: 1, losses: 0 });
    expect(b).toMatchObject({ rating: 1480, peakRating: 1500, gamesPlayed: 1, wins: 0, losses: 1 });

    for (const c of [red, black, viewer]) c.close();
  });

  it("ván không tính điểm, chat nhanh, đấu lại đổi màu quân", async () => {
    const [red, black, gameId] = await match("emma", "giang", "3+2", false);
    const redId = (await red.game()).players.r.id;
    await open(red, black, gameId);

    red.send({ t: "chat", gameId, phrase: 0 });
    const chatted = await black.game((g) => g.chat.length === 1);
    expect(chatted.chat[0]).toMatchObject({ side: "r", phrase: 0 });

    black.send({ t: "resign", gameId });
    const ended = await red.game((g) => g.status === "ended");
    expect(ended.rated).toBe(false);
    await waitUntil(async () => (await db.select().from(games).where(eq(games.id, gameId))).length === 1);
    const [row] = await db.select().from(games).where(eq(games.id, gameId));
    expect(row).toMatchObject({ rated: false, increment: 2, redRatingBefore: 1500, redRatingAfter: 1500 });
    const [u] = await db.select().from(users).where(eq(users.id, redId));
    expect(u).toMatchObject({ rating: 1500, gamesPlayed: 0 });

    red.send({ t: "rematch", gameId, action: "offer" });
    await black.game((g) => g.rematch.offeredBy === "r");
    black.send({ t: "rematch", gameId, action: "accept" });
    const next = (await red.waitFor("matched")).gameId;
    expect(next).not.toBe(gameId);
    expect((await black.waitFor("matched")).gameId).toBe(next);
    expect((await red.game((g) => g.id === gameId && g.rematch.gameId !== null)).rematch.gameId).toBe(next);
    red.send({ t: "watch", gameId: next });
    const fresh = await red.game((g) => g.id === next);
    expect(fresh.players.b.id).toBe(redId);
    expect(fresh.rated).toBe(false);
    red.send({ t: "abort", gameId: next });
    await red.game((g) => g.id === next && g.status === "aborted");
    red.close();
    black.close();
  });

  it("khách chỉ chơi được ván không tính điểm; tài khoản bị khóa không vào hàng đợi được", async () => {
    const guest = await createGuest(db);
    expect(guest.isGuest).toBe(true);
    const guestToken = (await createSession(db, guest.id)).token;
    const g = await connect(undefined, guestToken);
    g.send({ t: "queue", tc: "10+0", rated: true, variant: "xiangqi" });
    await g.waitFor("error", (m) => /Khách chỉ chơi được/.test(m.message));
    g.send({ t: "queue", tc: "10+0", rated: false, variant: "xiangqi" });
    await g.waitFor("queue", (m) => m.key?.rated === false);
    g.send({ t: "cancelQueue" });
    await g.waitFor("queue", (m) => m.key === null);
    g.close();

    await db.update(users).set({ bannedUntil: new Date(clock + 3_600_000) }).where(eq(users.id, ids.hoa));
    const banned = await connect("hoa");
    banned.send({ t: "queue", tc: "10+0", rated: true, variant: "xiangqi" });
    await banned.waitFor("error", (m) => /bị khóa/.test(m.message));
    banned.close();
  });

  it("rời ván quá lâu thì bị xử thua", async () => {
    const [red, black, gameId] = await match("chi", "dung", "5+3");
    await open(red, black, gameId);
    black.close();
    expect((await red.game((g) => !g.connected.b)).status).toBe("playing");
    await advance(61_000);
    const ended = await red.game((g) => g.status === "ended");
    expect(ended.result).toEqual({ winner: "r", reason: "abandon" });
    red.close();
  });

  it("không ai đi nước đầu thì ván bị hủy, không tính điểm", async () => {
    const [red, black, gameId] = await match("anh", "binh", "20+0");
    await advance(31_000);
    const aborted = await red.game((g) => g.status === "aborted");
    expect(aborted.result).toBeNull();
    expect(await db.select().from(games).where(eq(games.id, gameId))).toHaveLength(0);
    red.close();
    black.close();
  });

  it("từ chối tin nhắn sai định dạng và trang web lạ", async () => {
    const c = await connect("anh");
    c.send({ t: "move", gameId: "x", from: 999 });
    await c.waitFor("error", (m) => /không hợp lệ/.test(m.message));
    c.close();

    const evil = new Client(url, tokens.anh, "http://trang-la.example");
    const status = await new Promise<number>((resolve) => {
      evil.ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      evil.ws.on("error", () => resolve(-1));
    });
    expect(status).toBe(403);
  });

  it("máy chủ khởi động lại: ván đang chơi được khôi phục", async () => {
    const [red, black, gameId] = await match("khanh", "lan", "10+5");
    await open(red, black, gameId);
    red.close();
    black.close();
    await gs.close();

    const { server, url: nextUrl } = await startServer();
    expect(await server.restore()).toBe(1);
    url = nextUrl;
    const back = await connect("khanh");
    back.send({ t: "watch", gameId });
    const snap = await back.game((g) => g.id === gameId);
    expect(snap.status).toBe("playing");
    expect(snap.moves).toHaveLength(2);
    expect(snap.increment).toBe(5);
    back.close();
  });
});
