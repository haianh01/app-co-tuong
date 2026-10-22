import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/test/db";
import { GET as getGames, POST as postGame } from "./route";
import { GET as getSingleGame } from "./[id]/route";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: async () => {},
  };
});

describe("/api/tuong-thuat/games route endpoints", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const testRoom = "room-test-alpha-123456789";

  function createPostReq(body: Record<string, unknown>, room = testRoom) {
    return new Request("http://localhost:3000/api/tuong-thuat/games", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stage-Room": room,
      },
      body: JSON.stringify(body),
    });
  }

  it("từ chối khi thiếu hoặc sai định dạng room", async () => {
    const req = new Request("http://localhost:3000/api/tuong-thuat/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "g123456" }),
    });

    const res = await postGame(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Khóa phòng/);
  });

  it("bỏ qua ván dưới 6 nước mà không báo lỗi", async () => {
    const req = createPostReq({
      id: "stg_short001",
      moves: [{ from: 24, to: 25 }],
      plies: 1,
    });

    const res = await postGame(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe(true);
  });

  it("lưu ván hợp lệ từ 6 nước và lấy lại qua GET danh sách & GET chi tiết", async () => {
    const moves = [
      { from: 24, to: 25, notation: "P2-5" },
      { from: 72, to: 71, notation: "M8+7" },
      { from: 70, to: 67, notation: "M2+3" },
      { from: 26, to: 25, notation: "X9-8" },
      { from: 25, to: 24, notation: "X1-2" },
      { from: 71, to: 70, notation: "B7+1" },
    ];

    const postReq = createPostReq({
      id: "stg_stage001",
      round: 1,
      playedOn: "2026-10-22",
      mySide: "r",
      me: { name: "Bình luận viên", points: "1550" },
      opponent: { name: "Đối thủ Ziga", points: "1520" },
      result: "win",
      resultSource: "manual",
      moves,
      plies: 6,
      startedAt: "2026-10-22T08:00:00.000Z",
      endedAt: "2026-10-22T08:20:00.000Z",
    });

    const saveRes = await postGame(postReq);
    expect(saveRes.status).toBe(200);
    const saveJson = await saveRes.json();
    expect(saveJson.success).toBe(true);
    expect(saveJson.game.id).toBe("stg_stage001");

    // GET danh sách ván
    const listReq = new Request("http://localhost:3000/api/tuong-thuat/games", {
      method: "GET",
      headers: { "X-Stage-Room": testRoom },
    });
    const listRes = await getGames(listReq);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.games).toHaveLength(1);
    expect(listJson.games[0].id).toBe("stg_stage001");

    // GET chi tiết ván
    const detailReq = new Request("http://localhost:3000/api/tuong-thuat/games/game_stage_1", {
      method: "GET",
      headers: { "X-Stage-Room": testRoom },
    });
    const detailRes = await getSingleGame(detailReq, { params: Promise.resolve({ id: "stg_stage001" }) });
    expect(detailRes.status).toBe(200);
    const detailJson = await detailRes.json();
    expect(detailJson.game.id).toBe("stg_stage001");
    expect(detailJson.analysis).toBeNull();
  });


  it("trả về 403 khi phòng khác cố tình ghi đè ván cờ của phòng mình", async () => {
    const moves = [1, 2, 3, 4, 5, 6].map((i) => ({ from: i, to: i + 1 }));
    const postReq1 = createPostReq({
      id: "stg_protect1",
      round: 1,
      moves,
    });
    const res1 = await postGame(postReq1);
    expect(res1.status).toBe(200);

    // Phòng khác gửi cùng id để ghi đè
    const otherRoom = "room-test-bravo-987654321";
    const postReq2 = createPostReq(
      {
        id: "stg_protect1",
        round: 2,
        moves,
        result: "loss",
      },
      otherRoom
    );
    const res2 = await postGame(postReq2);
    expect(res2.status).toBe(403);
    const json2 = await res2.json();
    expect(json2.error).toMatch(/thuộc về phòng khác/i);
  });

  it("không xem được ván của phòng khác", async () => {
    const postReq = createPostReq({
      id: "stg_secret01",
      moves: [1, 2, 3, 4, 5, 6].map((i) => ({ from: i, to: i + 1 })),
      plies: 6,
    });
    await postGame(postReq);

    // Phòng khác truy cập
    const otherRoom = "room-test-bravo-987654321";
    const detailReq = new Request("http://localhost:3000/api/tuong-thuat/games/game_secret", {
      method: "GET",
      headers: { "X-Stage-Room": otherRoom },
    });
    const detailRes = await getSingleGame(detailReq, { params: Promise.resolve({ id: "stg_secret01" }) });
    expect(detailRes.status).toBe(404);
  });
});
