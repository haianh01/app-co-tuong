import { connection } from "next/server";
import { STAGE_ROOM_RE } from "@/lib/stage-protocol";
import { getDb } from "@/server/db";
import { RateLimiter } from "@/server/rate-limit";
import { getStageAnalysis, getStageGame, hashRoomKey } from "@/server/stage-games";

const limiter = new RateLimiter(60, 60_000);
const noStore = { "Cache-Control": "no-store" };

function getRoom(request: Request): string | null {
  const headerRoom = request.headers.get("x-stage-room");
  if (headerRoom && STAGE_ROOM_RE.test(headerRoom)) return headerRoom;

  const url = new URL(request.url);
  const queryRoom = url.searchParams.get("room");
  if (queryRoom && STAGE_ROOM_RE.test(queryRoom)) return queryRoom;

  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";
  if (!limiter.hit(ip)) {
    return Response.json({ error: "Quá nhiều yêu cầu" }, { status: 429, headers: noStore });
  }

  const { id } = await params;
  if (!/^stg_[a-z0-9]{8}$/i.test(id)) {
    return Response.json({ error: "Mã ván không hợp lệ" }, { status: 400, headers: noStore });
  }

  const room = getRoom(request);
  if (!room) {
    return Response.json({ error: "Khóa phòng (room) không hợp lệ hoặc thiếu" }, { status: 400, headers: noStore });
  }

  const db = await getDb();
  const ownerKey = hashRoomKey(room);
  const game = await getStageGame(db, id, ownerKey);

  if (!game) {
    return Response.json({ error: "Không tìm thấy ván cờ hoặc không có quyền truy cập" }, { status: 404, headers: noStore });
  }

  const analysis = await getStageAnalysis(db, id);

  return Response.json({ game, analysis }, { headers: noStore });
}
