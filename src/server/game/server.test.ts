// Test tích hợp: server HTTP thật + WebSocket thật + PostgreSQL nhúng (PGlite) trong RAM.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { sq } from "@/lib/xiangqi/engine";
import type { GameSnapshot, ServerMessage } from "@/lib/online/protocol";
import { createSession, registerUser } from "../auth";
import { createDb, type DbHandle } from "../db";
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

let h: DbHandle;
let http: Server;
let gs: GameServer;
let url: string;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

beforeAll(async () => {
  h = await createDb();
  for (const name of ["anh", "binh", "chi", "dung"]) {
    const res = await registerUser(h.db, { username: name, displayName: name.toUpperCase(), password: "matkhau123" });
    if (!res.ok) throw new Error(JSON.stringify(res.errors));
    ids[name] = res.user.id;
    tokens[name] = (await createSession(h.db, res.user.id)).token;
  }
  http = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  gs = new GameServer({ db: h.db, tickMs: 20, timings: { firstMoveMs: 1500, abandonMs: 300 }, log: () => {} });
  gs.attach(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`;
});

afterAll(async () => {
  await gs.close();
  await new Promise((resolve) => http.close(resolve));
  await h.close();
});

async function connect(name?: string) {
  const c = new Client(url, name ? tokens[name] : undefined);
  await c.opened();
  const hello = await c.waitFor("hello");
  expect(hello.user?.username ?? null).toBe(name ?? null);
  return c;
}

/** Hai người vào hàng đợi, được ghép, cùng mở ván. Trả về [đỏ, đen, gameId]. */
async function match(p: string, q: string, minutes: 5 | 10 | 20) {
  const a = await connect(p);
  const b = await connect(q);
  a.send({ t: "queue", minutes });
  await a.waitFor("queue", (m) => m.minutes === minutes);
  b.send({ t: "queue", minutes });
  const { gameId } = await a.waitFor("matched");
  expect((await b.waitFor("matched")).gameId).toBe(gameId);
  a.send({ t: "watch", gameId });
  b.send({ t: "watch", gameId });
  const snap = await a.game();
  await b.game();
  return snap.players.r.id === ids[p] ? ([a, b, gameId] as const) : ([b, a, gameId] as const);
}

describe("GameServer", () => {
  it("ghép cặp, kiểm tra nước đi, người xem, xin thua, lưu ván và Elo", async () => {
    const [red, black, gameId] = await match("anh", "binh", 10);

    // Đang có ván dở thì vào hàng đợi sẽ được đưa về ván đó.
    red.send({ t: "queue", minutes: 5 });
    expect((await red.waitFor("matched")).gameId).toBe(gameId);

    black.send({ t: "move", gameId, from: sq(0, 7), to: sq(2, 6), ply: 0 });
    await black.waitFor("error", (m) => /Chưa đến lượt/.test(m.message));

    red.send({ t: "move", gameId, from: sq(7, 7), to: sq(7, 4), ply: 0 });
    await black.game((g) => g.moves.length === 1);
    black.send({ t: "move", gameId, from: sq(0, 7), to: sq(2, 6), ply: 1 });
    await red.game((g) => g.moves.length === 2);

    // Gửi nước với số thứ tự cũ: server không áp dụng mà gửi lại trạng thái để đồng bộ.
    red.send({ t: "move", gameId, from: sq(9, 7), to: sq(7, 6), ply: 1 });
    expect((await red.game()).moves).toHaveLength(2);

    const viewer = await connect();
    viewer.send({ t: "watch", gameId });
    const seen = await viewer.game();
    expect(seen.moves).toHaveLength(2);
    expect(seen.connected).toEqual({ r: true, b: true });
    viewer.send({ t: "queue", minutes: 10 });
    await viewer.waitFor("error", (m) => /đăng nhập/.test(m.message));

    black.send({ t: "resign", gameId });
    const ended = await viewer.game((g) => g.status === "ended");
    expect(ended.result).toEqual({ winner: "r", reason: "resign" });
    const rated = await viewer.game((g) => g.ratingChange !== null);
    expect(rated.ratingChange).toEqual({ r: 20, b: -20 });

    const [row] = await h.db.select().from(games).where(eq(games.id, gameId));
    expect(row).toMatchObject({ winner: "r", reason: "resign", plies: 2, minutes: 10, redRatingAfter: 1520, blackRatingAfter: 1480 });
    const [r] = await h.db.select().from(users).where(eq(users.id, ended.players.r.id));
    const [b] = await h.db.select().from(users).where(eq(users.id, ended.players.b.id));
    expect(r).toMatchObject({ rating: 1520, peakRating: 1520, gamesPlayed: 1, wins: 1, losses: 0 });
    expect(b).toMatchObject({ rating: 1480, peakRating: 1500, gamesPlayed: 1, wins: 0, losses: 1 });

    for (const c of [red, black, viewer]) c.close();
  });

  it("rời ván quá lâu thì bị xử thua", async () => {
    const [red, black, gameId] = await match("chi", "dung", 5);
    red.send({ t: "move", gameId, from: sq(7, 7), to: sq(7, 4), ply: 0 });
    await black.game((g) => g.moves.length === 1);
    black.send({ t: "move", gameId, from: sq(0, 7), to: sq(2, 6), ply: 1 });
    await red.game((g) => g.moves.length === 2);

    black.close();
    expect((await red.game((g) => !g.connected.b)).status).toBe("playing");
    const ended = await red.game((g) => g.status === "ended");
    expect(ended.result).toEqual({ winner: "r", reason: "abandon" });
    red.close();
  });

  it("không ai đi nước đầu thì ván bị hủy, không tính điểm", async () => {
    const [red, black, gameId] = await match("anh", "binh", 20);
    const aborted = await red.game((g) => g.status === "aborted");
    expect(aborted.result).toBeNull();
    expect(await h.db.select().from(games).where(eq(games.id, gameId))).toHaveLength(0);
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
});
