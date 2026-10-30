// Chuyển tiếp trạng thái từ trang điều khiển tường thuật sang các trang sân khấu cùng phòng (xem src/lib/stage-protocol.ts).
// Server chỉ giữ lại tin "state" gần nhất của mỗi phòng để sân khấu mở sau (hay OBS tải lại) thấy ngay bàn cờ.

import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { STAGE_MAX_PAYLOAD, STAGE_ROOM_RE, STAGE_WS_PATH, isStageCommand, type StageRole, type StageServerMessage } from "@/lib/stage-protocol";

/** Số phòng tối đa giữ trong bộ nhớ; quá thì bỏ phòng không còn ai kết nối, cũ nhất trước. */
const MAX_ROOMS = 200;

interface Room {
  controls: Set<WebSocket>;
  views: Set<WebSocket>;
  /** Tin "state" gần nhất, giữ nguyên chuỗi JSON để gửi lại cho sân khấu mới kết nối. */
  last: string | null;
  touchedAt: number;
}

export interface StageRelayOptions {
  allowedOrigins?: string[];
  heartbeatMs?: number;
}

export class StageRelay {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: STAGE_MAX_PAYLOAD });
  private readonly rooms = new Map<string, Room>();
  private readonly alive = new WeakMap<WebSocket, boolean>();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private readonly opts: StageRelayOptions = {}) {}

  attach(server: HttpServer) {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!req.url) return;
      const url = new URL(req.url, "http://localhost");
      if (url.pathname !== STAGE_WS_PATH) return;
      const room = url.searchParams.get("room") ?? "";
      const role = url.searchParams.get("role");
      if (!STAGE_ROOM_RE.test(room) || (role !== "control" && role !== "view") || !this.originAllowed(req)) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, room, role));
    });
    this.heartbeat = setInterval(() => this.ping(), this.opts.heartbeatMs ?? 30_000);
    this.heartbeat.unref();
  }

  close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const ws of this.wss.clients) ws.terminate();
    this.wss.close();
  }

  /** Như GameServer: trình duyệt luôn gửi Origin, chỉ nhận trang cùng host hoặc host được khai báo. */
  private originAllowed(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (this.opts.allowedOrigins?.includes(origin)) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  private roomOf(key: string): Room {
    let room = this.rooms.get(key);
    if (!room) {
      if (this.rooms.size >= MAX_ROOMS) this.evict();
      room = { controls: new Set(), views: new Set(), last: null, touchedAt: Date.now() };
      this.rooms.set(key, room);
    }
    room.touchedAt = Date.now();
    return room;
  }

  private evict() {
    const idle = [...this.rooms.entries()]
      .filter(([, r]) => r.controls.size === 0 && r.views.size === 0)
      .sort((a, b) => a[1].touchedAt - b[1].touchedAt);
    for (const [key] of idle.slice(0, Math.max(1, idle.length - MAX_ROOMS / 2))) this.rooms.delete(key);
  }

  private onConnection(ws: WebSocket, key: string, role: StageRole) {
    const room = this.roomOf(key);
    this.alive.set(ws, true);
    ws.on("pong", () => this.alive.set(ws, true));
    ws.on("error", () => ws.terminate());

    if (role === "view") {
      room.views.add(ws);
      if (room.last) ws.send(room.last);
      this.announceViewers(room);
      ws.on("close", () => {
        room.views.delete(ws);
        this.announceViewers(room);
      });
      // Sân khấu chỉ gửi ngược được lệnh trong danh sách; server dựng lại tin chứ không chuyển nguyên chuỗi.
      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        let msg: { t?: unknown; cmd?: unknown };
        try {
          msg = JSON.parse(data.toString()) as { t?: unknown; cmd?: unknown };
        } catch {
          return;
        }
        if (msg.t !== "cmd" || !isStageCommand(msg.cmd)) return;
        room.touchedAt = Date.now();
        for (const c of room.controls) send(c, { t: "cmd", cmd: msg.cmd });
      });
      return;
    }

    room.controls.add(ws);
    send(ws, { t: "viewers", n: room.views.size });
    ws.on("close", () => room.controls.delete(ws));
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const text = data.toString();
      let t: unknown;
      try {
        t = (JSON.parse(text) as { t?: unknown }).t;
      } catch {
        return;
      }
      if (t !== "state" && t !== "recap" && t !== "voice") return;
      if (t === "state") room.last = text;
      room.touchedAt = Date.now();
      for (const v of room.views) if (v.readyState === WebSocket.OPEN) v.send(text);
    });
  }

  private announceViewers(room: Room) {
    for (const c of room.controls) send(c, { t: "viewers", n: room.views.size });
  }

  private ping() {
    for (const ws of this.wss.clients) {
      if (!this.alive.get(ws)) {
        ws.terminate();
        continue;
      }
      this.alive.set(ws, false);
      ws.ping();
    }
  }
}

function send(ws: WebSocket, msg: StageServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
