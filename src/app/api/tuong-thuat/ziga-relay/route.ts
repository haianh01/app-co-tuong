import { NextRequest } from "next/server";
import { parseZigaPacket, type ZigaParsedMessage } from "@/lib/ziga/ziga-parser";

export interface ZigaRelayPacket {
  id: string;
  direction: "in" | "out";
  timestamp: number;
  encoding: "text" | "base64";
  payload: unknown;
  /** Nội dung đã giải mã từ base64 nếu là UTF-8 hợp lệ */
  decodedText?: string;
  parsed: ZigaParsedMessage;
}

const MAX_HISTORY = 100;
// Bộ nhớ đệm các gói tin gần nhất trong tiến trình
const packetHistory: ZigaRelayPacket[] = [];
// Danh sách các luồng SSE đang mở lắng nghe
const sseListeners = new Set<(eventData: string) => void>();

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

/** Nhận gói tin từ Tampermonkey script và phát trực tiếp tới giao diện /tuong-thuat/ziga */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const direction = json.direction === "out" ? "out" : "in";
    const timestamp = typeof json.timestamp === "number" ? json.timestamp : Date.now();
    const encoding = json.encoding === "base64" ? "base64" : "text";
    const payload = json.payload;
    const decodedText =
      encoding === "base64" && typeof payload === "string" ? decodeBase64Text(payload) : undefined;

    const parsed = parseZigaPacket(decodedText ?? payload);
    const packet: ZigaRelayPacket = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      direction,
      timestamp,
      encoding,
      payload,
      decodedText,
      parsed,
    };

    packetHistory.push(packet);
    if (packetHistory.length > MAX_HISTORY) {
      packetHistory.shift();
    }

    // Phát tới tất cả tab /tuong-thuat/ziga đang mở
    const sseEvent = `data: ${JSON.stringify(packet)}\n\n`;
    for (const listener of sseListeners) {
      try {
        listener(sseEvent);
      } catch {}
    }

    return Response.json({ ok: true, id: packet.id, parsed }, { headers: CORS_HEADERS });
  } catch (err) {
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
    packetHistory.length = 0;
    return Response.json({ ok: true }, { headers: CORS_HEADERS });
  }

  if (searchParams.get("action") === "history") {
    return Response.json({ ok: true, packets: packetHistory }, { headers: CORS_HEADERS });
  }

  let streamListener: ((eventData: string) => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      streamListener = (eventData: string) => {
        try {
          controller.enqueue(new TextEncoder().encode(eventData));
        } catch {}
      };
      sseListeners.add(streamListener);

      // Gửi ngay danh sách các gói tin gần nhất khi vừa mở trang
      const initEvent = `event: init\ndata: ${JSON.stringify(packetHistory.slice(-20))}\n\n`;
      controller.enqueue(new TextEncoder().encode(initEvent));

      // Giữ kết nối (Heartbeat ping) mỗi 15 giây
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {}
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (streamListener) sseListeners.delete(streamListener);
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
