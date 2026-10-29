import type { IncomingMessage, ServerResponse } from "node:http";
import { generateSpeechAudio } from "./tts";
import type { LiveBotService } from "./service";
import type { BotReplyRequest } from "./types";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer | string) => {
      body += chunk.toString();
      if (body.length > 20_000) {
        req.destroy();
        reject(new Error("Payload quá lớn"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

/**
 * Xử lý các request liên quan tới Live Bot.
 * Trả về true nếu request đã được xử lý (không cần chuyển tiếp cho Next.js).
 */
export async function handleBotRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bot: LiveBotService,
): Promise<boolean> {
  if (!req.url) return false;
  const url = new URL(req.url, "http://localhost");

  // SSE Events stream cho OBS overlay và Live2D Avatar
  if (req.method === "GET" && (url.pathname === "/api/bot/events" || url.pathname === "/events")) {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    const cleanup = bot.addOverlayClient(res);
    req.on("close", cleanup);
    return true;
  }

  // TTS phát giọng đọc trực tiếp
  if (req.method === "GET" && (url.pathname === "/api/bot/tts" || url.pathname === "/api/tts")) {
    const text = (url.searchParams.get("text") ?? "").slice(0, 500);
    if (!text.trim()) {
      sendJson(res, 400, { error: "Thiếu tham số text" });
      return true;
    }
    try {
      const { audio, contentType } = await generateSpeechAudio(text);
      res.writeHead(200, {
        "content-type": contentType,
        "content-length": audio.length,
        "cache-control": "no-store",
      });
      res.end(audio);
    } catch (err: unknown) {
      sendJson(res, 502, {
        error: `Không tạo được giọng đọc: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // Lấy trạng thái bot
  if (req.method === "GET" && url.pathname === "/api/bot/status") {
    sendJson(res, 200, bot.getStatus());
    return true;
  }

  // Cập nhật cài đặt (inGame, style)
  if (req.method === "POST" && url.pathname === "/api/bot/settings") {
    try {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const updated = bot.updateSettings(parsed);
      sendJson(res, 200, updated);
    } catch {
      sendJson(res, 400, { error: "Dữ liệu JSON không hợp lệ" });
    }
    return true;
  }

  // Gửi sự kiện thử nghiệm (bình luận, tặng quà, vào phòng)
  if (req.method === "POST" && url.pathname === "/api/bot/event") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as BotReplyRequest;
      const result = await bot.processEvent(body, "panel");
      sendJson(res, 200, { result, status: bot.getStatus() });
    } catch {
      sendJson(res, 400, { error: "Dữ liệu JSON không hợp lệ" });
    }
    return true;
  }

  // Vào phòng sân khấu tường thuật
  if (req.method === "POST" && url.pathname === "/api/bot/stage") {
    try {
      const raw = await readBody(req);
      const room = bot.joinStage(raw);
      if (room) {
        sendJson(res, 200, { room });
      } else {
        sendJson(res, 400, { error: "Không tìm thấy mã phòng sân khấu hợp lệ" });
      }
    } catch {
      sendJson(res, 400, { error: "Lỗi kết nối sân khấu" });
    }
    return true;
  }

  // Chuyển hướng tiện ích cho các link tắt OBS cũ
  if (req.method === "GET" && url.pathname === "/overlay") {
    res.writeHead(302, { Location: `/live-bot/overlay.html${url.search}` });
    res.end();
    return true;
  }
  if (req.method === "GET" && url.pathname === "/avatar") {
    res.writeHead(302, { Location: `/live-bot/avatar.html${url.search}` });
    res.end();
    return true;
  }

  return false;
}
