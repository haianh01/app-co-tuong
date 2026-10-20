import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { StageRelay } from "./stage-relay";

const ROOM = "abcdefghijklmnop_123";

let server: Server;
let relay: StageRelay;
let base: string;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  server = createServer();
  relay = new StageRelay();
  relay.attach(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws/stage`;
});

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  relay.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Mở kết nối và gom mọi tin nhận được. */
async function connect(role: string, room = ROOM, headers?: Record<string, string>) {
  const ws = new WebSocket(`${base}?room=${room}&role=${role}`, { headers });
  sockets.push(ws);
  const inbox: unknown[] = [];
  ws.on("message", (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return { ws, inbox };
}

async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
}

describe("StageRelay", () => {
  it("chuyển trạng thái từ điều khiển sang sân khấu cùng phòng, và báo số sân khấu cho điều khiển", async () => {
    const control = await connect("control");
    const view = await connect("view");
    await until(() => control.inbox.some((m) => (m as { n?: number }).n === 1));

    control.ws.send(JSON.stringify({ t: "state", state: { ply: 3 } }));
    await until(() => view.inbox.length === 1);
    expect(view.inbox[0]).toEqual({ t: "state", state: { ply: 3 } });
  });

  it("sân khấu mở sau vẫn nhận ngay trạng thái gần nhất", async () => {
    const control = await connect("control");
    control.ws.send(JSON.stringify({ t: "state", state: { ply: 1 } }));
    control.ws.send(JSON.stringify({ t: "state", state: { ply: 2 } }));
    await new Promise((r) => setTimeout(r, 50));
    const view = await connect("view");
    await until(() => view.inbox.length === 1);
    expect(view.inbox[0]).toEqual({ t: "state", state: { ply: 2 } });
  });

  it("không lọt sang phòng khác, và sân khấu không gửi ngược được", async () => {
    const control = await connect("control");
    const other = await connect("view", "zzzzzzzzzzzzzzzz_other");
    const view = await connect("view");
    view.ws.send(JSON.stringify({ t: "state", state: { hacked: true } }));
    control.ws.send(JSON.stringify({ t: "recap" }));
    await until(() => view.inbox.length === 1);
    expect(view.inbox[0]).toEqual({ t: "recap" });
    expect(other.inbox).toEqual([]);
  });

  it("từ chối khóa phòng sai dạng hoặc trang web lạ", async () => {
    await expect(connect("view", "short")).rejects.toThrow();
    await expect(connect("admin")).rejects.toThrow();
    await expect(connect("view", ROOM, { Origin: "https://evil.example" })).rejects.toThrow();
  });
});
