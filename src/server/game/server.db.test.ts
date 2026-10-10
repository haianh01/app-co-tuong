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
import { games, tournamentPlayers, tournaments, users } from "../db/schema";
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

describe("phòng bạn bè", () => {
  async function user(name: string) {
    const res = await registerUser(db, { username: name, displayName: name.toUpperCase(), password: "matkhau123" });
    if (!res.ok) throw new Error(JSON.stringify(res.errors));
    ids[name] = res.user.id;
    tokens[name] = (await createSession(db, res.user.id)).token;
  }

  beforeAll(async () => {
    for (const n of ["minh", "nam", "oanh", "phuc"]) await user(n);
  });

  it("tạo lời mời, người lạ xem được ai mời, bạn nhận lời là vào ván với đúng màu quân đã chọn", async () => {
    const host = await connect("minh");
    host.send({ t: "challengeCreate", tc: "5+3", rated: false, variant: "xiangqi", color: "b" });
    const { challenge } = await host.waitFor("challenge", (m) => m.challenge !== null);
    expect(challenge).toMatchObject({ tc: "5+3", rated: false, color: "b", by: { username: "minh" } });
    expect(challenge!.code).toMatch(/^[a-z2-9]{6}$/);

    // Mở link khi chưa đăng nhập: thấy lời mời, biết người mời đang trực tuyến.
    const stranger = await connect();
    stranger.send({ t: "challengeInfo", code: challenge!.code });
    const info = await stranger.waitFor("challengeInfo");
    expect(info).toMatchObject({ online: true, challenge: { by: { displayName: "MINH" } } });
    stranger.send({ t: "challengeAccept", code: challenge!.code });
    await stranger.waitFor("error", (m) => /đăng nhập/.test(m.message));

    // Tự nhận lời mời của mình: bị từ chối.
    host.send({ t: "challengeAccept", code: challenge!.code });
    await host.waitFor("error", (m) => /chính bạn/.test(m.message));

    const friend = await connect("nam");
    friend.send({ t: "challengeAccept", code: challenge!.code });
    const { gameId } = await friend.waitFor("matched");
    // Người mời được báo lời mời đã đóng, rồi được đưa vào ván.
    await host.waitFor("challenge", (m) => m.challenge === null);
    expect((await host.waitFor("matched")).gameId).toBe(gameId);
    friend.send({ t: "watch", gameId });
    const g = await friend.game();
    expect(g.players.b.id).toBe(ids.minh);
    expect(g.players.r.id).toBe(ids.nam);
    expect(g).toMatchObject({ minutes: 5, increment: 3, rated: false });

    // Lời mời đã dùng thì không dùng lại được.
    const late = await connect("oanh");
    late.send({ t: "challengeAccept", code: challenge!.code });
    await late.waitFor("error", (m) => /không tồn tại|hết hạn/.test(m.message));

    friend.send({ t: "abort", gameId });
    await friend.game((x) => x.status !== "playing");
    for (const c of [host, stranger, friend, late]) c.close();
  });

  it("người mời tắt trang: lời mời vẫn còn nhưng chưa nhận được; mở lại trang thì thấy lời mời cũ", async () => {
    let host = await connect("oanh");
    host.send({ t: "challengeCreate", tc: "10+0", rated: true, variant: "xiangqi", color: "random" });
    const { challenge } = await host.waitFor("challenge", (m) => m.challenge !== null);
    host.close();
    await new Promise((r) => setTimeout(r, 50));

    const friend = await connect("phuc");
    friend.send({ t: "challengeInfo", code: challenge!.code });
    expect(await friend.waitFor("challengeInfo")).toMatchObject({ online: false });
    friend.send({ t: "challengeAccept", code: challenge!.code });
    await friend.waitFor("error", (m) => /không trực tuyến/.test(m.message));

    host = await connect("oanh");
    expect((await host.waitFor("challenge")).challenge?.code).toBe(challenge!.code);

    // Hủy lời mời: link không còn dùng được.
    host.send({ t: "challengeCancel" });
    await host.waitFor("challenge", (m) => m.challenge === null);
    friend.send({ t: "challengeInfo", code: challenge!.code });
    expect(await friend.waitFor("challengeInfo")).toMatchObject({ challenge: null });
    host.close();
    friend.close();
  });

  it("lời mời hết hạn sau 30 phút; khách không nhận được lời mời tính điểm", async () => {
    const host = await connect("phuc");
    host.send({ t: "challengeCreate", tc: "3+2", rated: true, variant: "xiangqi", color: "r" });
    const { challenge } = await host.waitFor("challenge", (m) => m.challenge !== null);

    const guest = await createGuest(db);
    const g = await connect(undefined, (await createSession(db, guest.id)).token);
    g.send({ t: "challengeAccept", code: challenge!.code });
    await g.waitFor("error", (m) => /Khách/.test(m.message));

    await advance(30 * 60_000 + 1);
    await host.waitFor("challenge", (m) => m.challenge === null);
    g.send({ t: "challengeInfo", code: challenge!.code });
    expect(await g.waitFor("challengeInfo")).toMatchObject({ challenge: null });

    // Khách vẫn tạo được lời mời không tính điểm, nhưng không tạo được lời mời tính điểm.
    g.send({ t: "challengeCreate", tc: "3+2", rated: true, variant: "xiangqi", color: "r" });
    await g.waitFor("error", (m) => /Khách/.test(m.message));
    g.send({ t: "challengeCreate", tc: "3+2", rated: false, variant: "xiangqi", color: "r" });
    expect((await g.waitFor("challenge")).challenge).toMatchObject({ rated: false });
    host.close();
    g.close();
  });

  it("tin nhắn lời mời sai định dạng bị từ chối", async () => {
    const c = await connect("minh");
    c.send({ t: "challengeAccept", code: "../../x" });
    await c.waitFor("error", (m) => /không hợp lệ/.test(m.message));
    c.send({ t: "challengeCreate", tc: "99+0", rated: false, variant: "xiangqi", color: "r" });
    await c.waitFor("error", (m) => /không hợp lệ/.test(m.message));
    c.close();
  });
});

describe("giải Arena", () => {
  it("đăng ký sẵn sàng thì tự được ghép; xong ván được cộng điểm, nghỉ vài giây rồi ghép ván mới đổi màu; tạm nghỉ thì thôi", async () => {
    const server = servers.at(-1)!.server;
    for (const n of ["quang", "son"]) {
      const res = await registerUser(db, { username: n, displayName: n.toUpperCase(), password: "matkhau123" });
      if (!res.ok) throw new Error(JSON.stringify(res.errors));
      ids[n] = res.user.id;
      tokens[n] = (await createSession(db, res.user.id)).token;
    }
    const tid = "ztest01";
    await db.insert(tournaments).values({
      id: tid, name: "Arena thử", startsAt: new Date(clock - 60_000), endsAt: new Date(clock + 60 * 60_000),
      minutes: 3, increment: 2, status: "running", prizes: [100],
    });
    await server.syncTournaments();

    const q = await connect("quang");
    const s = await connect("son");
    const viewer = await connect();
    viewer.send({ t: "arenaWatch", id: tid });
    q.send({ t: "arenaJoin", id: tid });
    await q.waitFor("arena", (m) => m.ready);
    s.send({ t: "arenaJoin", id: tid });
    const { gameId } = await q.waitFor("matched");
    expect((await s.waitFor("matched")).gameId).toBe(gameId);
    q.send({ t: "watch", gameId });
    s.send({ t: "watch", gameId });
    const g = await q.game();
    expect(g).toMatchObject({ tournamentId: tid, rated: true, minutes: 3, increment: 2 });
    const [red, black] = g.players.r.id === ids.quang ? [q, s] : [s, q];
    const firstRed = g.players.r.id;
    await open(red, black, gameId);
    black.send({ t: "resign", gameId });
    await viewer.waitFor("arenaUpdate", (m) => m.id === tid);
    await waitUntil(async () => {
      const [r] = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.userId, firstRed));
      return r?.score === 2;
    });

    // Đang nghỉ: chưa ghép ngay.
    await advance(1000);
    await expect(q.waitFor("matched", () => true, 150)).rejects.toThrow();
    await advance(4000);
    const next = (await q.waitFor("matched")).gameId;
    expect(next).not.toBe(gameId);
    q.send({ t: "watch", gameId: next });
    const g2 = await q.game((x) => x.id === next);
    expect(g2.players.b.id).toBe(firstRed);

    // Hủy ván (chưa đi nước nào) rồi tạm nghỉ: không bị ghép tiếp.
    q.send({ t: "abort", gameId: next });
    await q.game((x) => x.id === next && x.status === "aborted");
    q.send({ t: "arenaLeave", id: tid });
    await q.waitFor("arena", (m) => !m.ready);
    await advance(10_000);
    await expect(q.waitFor("matched", () => true, 200)).rejects.toThrow();
    for (const c of [q, s, viewer]) c.close();
  });

  it("khách không tham gia được giải", async () => {
    const guest = await createGuest(db);
    const g = await connect(undefined, (await createSession(db, guest.id)).token);
    g.send({ t: "arenaJoin", id: "ztest01" });
    await g.waitFor("error", (m) => /Khách/.test(m.message));
    g.close();
  });
});

describe("cờ úp online", () => {
  it("máy chủ giữ bố cục bí mật: người chơi chỉ thấy quân úp, quân được lật khi đi; lưu bố cục khi ván xong", async () => {
    for (const n of ["tam", "uyen"]) {
      const res = await registerUser(db, { username: n, displayName: n.toUpperCase(), password: "matkhau123" });
      if (!res.ok) throw new Error(JSON.stringify(res.errors));
      ids[n] = res.user.id;
      tokens[n] = (await createSession(db, res.user.id)).token;
    }
    const a = await connect("tam");
    const b = await connect("uyen");
    const raw: string[] = [];
    a.ws.on("message", (d) => raw.push(d.toString()));
    a.send({ t: "queue", tc: "10+0", rated: false, variant: "jieqi" });
    await a.waitFor("queue", (m) => m.key?.variant === "jieqi");
    b.send({ t: "queue", tc: "10+0", rated: false, variant: "jieqi" });
    const { gameId } = await a.waitFor("matched");
    await b.waitFor("matched");
    a.send({ t: "watch", gameId });
    b.send({ t: "watch", gameId });
    const g = await a.game();
    await b.game();
    expect(g.variant).toBe("jieqi");
    expect(g.hidden).toHaveLength(30);
    const [red, black] = g.players.r.id === ids.tam ? [a, b] : [b, a];

    // Đỏ đi quân úp ở ô Pháo phải sang giữa: nước đi được lật quân (đúng phe Đỏ).
    red.send({ t: "move", gameId, from: sq(7, 7), to: sq(7, 4), ply: 0 });
    const g1 = await black.game((x) => x.moves.length === 1);
    expect(g1.moves[0].reveal).toMatch(/^[RNBACP]$/);
    expect(g1.hidden).toHaveLength(29);
    black.send({ t: "move", gameId, from: sq(0, 1), to: sq(2, 2), ply: 1 }); // quân úp ô Mã đen
    const g2 = await red.game((x) => x.moves.length === 2);
    expect(g2.moves[1].reveal).toMatch(/^[rnbacp]$/);

    // Không tin nhắn nào gửi cho người chơi chứa bố cục bí mật.
    expect(raw.some((s) => s.includes("setup"))).toBe(false);

    black.send({ t: "resign", gameId });
    await red.game((x) => x.status === "ended");
    await waitUntil(async () => (await db.select().from(games).where(eq(games.id, gameId))).length === 1);
    const [row] = await db.select().from(games).where(eq(games.id, gameId));
    expect(row.variant).toBe("jieqi");
    const layout = new Map((row.setup as [number, string][]).map(([s, p]) => [s, p]));
    expect(layout.size).toBe(30);
    // Quân đã lật trong ván khớp đúng bố cục đã lưu.
    expect(layout.get(sq(7, 7))).toBe(g1.moves[0].reveal);
    expect(layout.get(sq(0, 1))).toBe(g2.moves[1].reveal);
    a.close();
    b.close();
  });
});
