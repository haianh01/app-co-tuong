import { connection } from "next/server";
import { STAGE_ROOM_RE } from "@/lib/stage-protocol";
import { SESSION_COOKIE, getUserBySession, parseCookies } from "@/server/auth";
import { getDb } from "@/server/db";
import { RateLimiter } from "@/server/rate-limit";
import { hashRoomKey, listStageGames, saveStageGame } from "@/server/stage-games";

const limiter = new RateLimiter(60, 60_000);
const noStore = { "Cache-Control": "no-store" };

function getRoom(request: Request, bodyRoom?: unknown): string | null {
  const headerRoom = request.headers.get("x-stage-room");
  if (headerRoom && STAGE_ROOM_RE.test(headerRoom)) return headerRoom;

  if (typeof bodyRoom === "string" && STAGE_ROOM_RE.test(bodyRoom)) {
    return bodyRoom;
  }

  const url = new URL(request.url);
  const queryRoom = url.searchParams.get("room");
  if (queryRoom && STAGE_ROOM_RE.test(queryRoom)) return queryRoom;

  return null;
}

export async function POST(request: Request) {
  await connection();
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";
  if (!limiter.hit(ip)) {
    return Response.json({ error: "Quá nhiều yêu cầu" }, { status: 429, headers: noStore });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Dữ liệu JSON không hợp lệ" }, { status: 400, headers: noStore });
  }

  const room = getRoom(request, body.room);
  if (!room) {
    return Response.json({ error: "Khóa phòng (room) không hợp lệ hoặc thiếu" }, { status: 400, headers: noStore });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!/^stg_[a-z0-9]{8}$/i.test(id)) {
    return Response.json({ error: "Mã ván id không hợp lệ" }, { status: 400, headers: noStore });
  }

  if (!Array.isArray(body.moves) || body.moves.length > 500) {
    return Response.json({ error: "Biên bản nước đi không hợp lệ (tối đa 500 nước)" }, { status: 400, headers: noStore });
  }
  const moves = body.moves;
  const plies = moves.length;
  if (plies < 6) {
    return Response.json(
      { ignored: true, reason: "Ván dưới 6 nước không cần lưu" },
      { status: 200, headers: noStore },
    );
  }

  const startFen = typeof body.startFen === "string" && body.startFen.trim()
    ? body.startFen.trim()
    : "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";

  const me = typeof body.me === "object" && body.me !== null
    ? (body.me as { name: string; points?: string; title?: string; stars?: number; avatarUrl?: string })
    : { name: "Bạn" };

  const opponent = typeof body.opponent === "object" && body.opponent !== null
    ? (body.opponent as { name: string; points?: string; title?: string; stars?: number; avatarUrl?: string })
    : { name: "Đối thủ" };

  const mySide = body.mySide === "b" ? "b" : "r";
  const site = typeof body.site === "string" && body.site.trim() ? body.site.trim() : "manual";
  const round = typeof body.round === "number" ? body.round : null;
  const playedOn = typeof body.playedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.playedOn)
    ? body.playedOn
    : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

  const result = body.result === "win" || body.result === "draw" || body.result === "loss" ? body.result : null;
  const resultSource = body.resultSource === "manual" || body.resultSource === "board" ? body.resultSource : null;
  const timeControl = typeof body.timeControl === "string" ? body.timeControl : null;

  const startedAt = body.startedAt ? new Date(String(body.startedAt)) : new Date();
  const endedAt = body.endedAt ? new Date(String(body.endedAt)) : new Date();

  const db = await getDb();
  let userId: string | null = null;
  const token = parseCookies(request.headers.get("cookie") ?? undefined)[SESSION_COOKIE];
  if (token) {
    const user = await getUserBySession(db, token);
    if (user && !user.isGuest) {
      userId = user.id;
    }
  }

  const ownerKey = hashRoomKey(room);
  try {
    const saved = await saveStageGame(db, {
      id,
      ownerKey,
      userId,
      site,
      round,
      playedOn,
      mySide,
      me,
      opponent,
      result,
      resultSource,
      startFen,
      moves: moves as { from: number; to: number; notation?: string }[],
      plies,
      timeControl,
      startedAt: Number.isNaN(startedAt.getTime()) ? new Date() : startedAt,
      endedAt: Number.isNaN(endedAt.getTime()) ? new Date() : endedAt,
    });

    return Response.json({ success: true, game: saved }, { headers: noStore });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return Response.json({ error: "Ván cờ thuộc về phòng khác" }, { status: 403, headers: noStore });
    }
    throw err;
  }
}

export async function GET(request: Request) {
  await connection();
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";
  if (!limiter.hit(ip)) {
    return Response.json({ error: "Quá nhiều yêu cầu" }, { status: 429, headers: noStore });
  }

  const room = getRoom(request);
  if (!room) {
    return Response.json({ error: "Khóa phòng (room) không hợp lệ hoặc thiếu" }, { status: 400, headers: noStore });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? undefined;
  const resultParam = url.searchParams.get("result");
  const result = resultParam === "win" || resultParam === "draw" || resultParam === "loss" ? resultParam : undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) ? limitParam : undefined;

  const db = await getDb();
  const ownerKey = hashRoomKey(room);
  const data = await listStageGames(db, ownerKey, { date, result, q, cursor, limit });

  return Response.json(data, { headers: noStore });
}
