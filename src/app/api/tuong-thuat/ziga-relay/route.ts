import { NextRequest } from "next/server";
import { parseZigaBinaryFrame, parseZigaPacket, parseZigaUiEvent, type ZigaParsedMessage } from "@/lib/ziga/ziga-parser";

export interface ZigaRelayPacket {
  id: string;
  /** Số thứ tự tăng dần phía server — dùng làm SSE id để phát bù khi client nối lại */
  seq: number;
  /** in/out: gói WebSocket của Ziga · ui: trạng thái giao diện script đọc từ bàn cờ Cocos */
  direction: "in" | "out" | "ui";
  timestamp: number;
  encoding: "text" | "base64" | "json";
  payload: unknown;
  /** Nội dung đã giải mã từ base64 nếu là UTF-8 hợp lệ */
  decodedText?: string;
  parsed: ZigaParsedMessage;
}

const MAX_HISTORY = 1000;
const MAX_BATCH = 200;

interface RelayState {
  seq: number;
  // Bộ nhớ đệm các gói tin gần nhất trong tiến trình
  history: ZigaRelayPacket[];
  // Danh sách các luồng SSE đang mở lắng nghe
  listeners: Set<(eventData: string) => void>;
}

// Giữ trên globalThis để HMR của Next dev không xoá lịch sử và làm rơi các luồng SSE đang mở
const globalRelay = globalThis as typeof globalThis & { __zigaRelay?: RelayState };
const relay: RelayState = (globalRelay.__zigaRelay ??= { seq: 0, history: [], listeners: new Set() });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/** Giải mã base64 sang UTF-8; trả undefined nếu là binary thật (không phải UTF-8 hợp lệ). */
export function decodeBase64Text(b64: string): string | undefined {
  try {
    const bytes = Buffer.from(b64, "base64");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function toSseEvent(packet: ZigaRelayPacket): string {
  return `id: ${packet.seq}\ndata: ${JSON.stringify(packet)}\n\n`;
}

function ingest(raw: Record<string, unknown>): ZigaRelayPacket {
  const direction = raw.direction === "out" ? "out" : raw.direction === "ui" ? "ui" : "in";
  const timestamp = typeof raw.timestamp === "number" ? raw.timestamp : Date.now();
  const encoding = raw.encoding === "base64" ? "base64" : raw.encoding === "json" ? "json" : "text";
  const payload = raw.payload;
  // Ziga dùng giao thức binary riêng; khung nhỏ toàn byte < 0x80 cũng là UTF-8 hợp lệ,
  // nên phải thử giải mã khung Ziga trước rồi mới coi là text
  const frame =
    encoding === "base64" && typeof payload === "string"
      ? parseZigaBinaryFrame(new Uint8Array(Buffer.from(payload, "base64")))
      : null;
  const decodedText =
    !frame && encoding === "base64" && typeof payload === "string" ? decodeBase64Text(payload) : undefined;
  let parsed = direction === "ui" ? parseZigaUiEvent(payload) : (frame ?? parseZigaPacket(decodedText ?? payload));
  // Nước mình gửi đi có thể bị server từ chối — chỉ tin nước server xác nhận (gói "in" phát lại cho cả bàn)
  if (frame?.move && direction === "out") {
    parsed = { ...parsed, move: undefined, eventType: "move_sent", summary: `(gửi đi) ${parsed.summary}` };
  }

  const seq = ++relay.seq;
  const packet: ZigaRelayPacket = {
    id: `${seq}-${Math.random().toString(36).slice(2, 7)}`,
    seq,
    direction,
    timestamp,
    encoding,
    payload,
    decodedText,
    parsed,
  };

  relay.history.push(packet);
  if (relay.history.length > MAX_HISTORY) relay.history.shift();

  // Phát tới tất cả tab /tuong-thuat/ziga đang mở
  const sseEvent = toSseEvent(packet);
  for (const listener of relay.listeners) {
    try {
      listener(sseEvent);
    } catch {}
  }
  return packet;
}

/** Nhận gói tin từ Tampermonkey script (một gói, hoặc lô `{ packets: [...] }` theo đúng thứ tự) */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    if (!json || typeof json !== "object") throw new Error("invalid");

    if (Array.isArray(json.packets)) {
      const items = (json.packets as unknown[])
        .slice(0, MAX_BATCH)
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
      const packets = items.map(ingest);
      return Response.json(
        { ok: true, count: packets.length, lastSeq: packets.at(-1)?.seq ?? relay.seq },
        { headers: CORS_HEADERS },
      );
    }

    const packet = ingest(json);
    return Response.json({ ok: true, id: packet.id, seq: packet.seq, parsed: packet.parsed }, { headers: CORS_HEADERS });
  } catch {
    return Response.json(
      { ok: false, error: "Dữ liệu JSON không hợp lệ" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
}

/** Mở luồng Server-Sent Events (SSE) để truyền gói tin thời gian thực tới giao diện */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("action") === "clear") {
    relay.history.length = 0;
    return Response.json({ ok: true }, { headers: CORS_HEADERS });
  }

  if (searchParams.get("action") === "history") {
    return Response.json({ ok: true, lastSeq: relay.seq, packets: relay.history }, { headers: CORS_HEADERS });
  }

  const encoder = new TextEncoder();
  const sinceRaw = req.headers.get("last-event-id") ?? searchParams.get("since");
  const sinceNum = sinceRaw === null ? NaN : Number(sinceRaw);
  const since = Number.isInteger(sinceNum) && sinceNum >= 0 ? sinceNum : null;

  let streamListener: ((eventData: string) => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      streamListener = (eventData: string) => {
        try {
          controller.enqueue(encoder.encode(eventData));
        } catch {}
      };
      relay.listeners.add(streamListener);

      // Nối lại (trình duyệt tự gửi Last-Event-ID, hoặc ?since=): phát bù các gói đã lỡ, đúng thứ tự.
      // Mở mới: chỉ gửi vài gói gần nhất để hiển thị, kèm lastSeq để client biết mốc.
      if (since !== null && since <= relay.seq) {
        const missed = relay.history.filter((p) => p.seq > since).map(toSseEvent).join("");
        if (missed) controller.enqueue(encoder.encode(missed));
      } else {
        const initEvent = `event: init\ndata: ${JSON.stringify({ lastSeq: relay.seq, packets: relay.history.slice(-20) })}\n\n`;
        controller.enqueue(encoder.encode(initEvent));
      }

      // Giữ kết nối (Heartbeat ping) mỗi 15 giây
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {}
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (streamListener) relay.listeners.delete(streamListener);
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
