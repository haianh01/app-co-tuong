import { beforeEach, describe, expect, it } from "vitest";
import { insertUser, resetDb } from "@/test/db";
import type { Database } from "@/server/db";
import { stageGames } from "@/server/db/schema";
import {
  getStageAnalysis,
  getStageGame,
  hashRoomKey,
  listStageGames,
  saveStageAnalysis,
  saveStageGame,
} from "./stage-games";

describe("stage-games db storage and retrieval", () => {
  let db: Database;

  beforeEach(async () => {
    db = await resetDb();
  });

  const testRoomA = "room-test-alpha-123456789";
  const ownerA = hashRoomKey(testRoomA);
  const testRoomB = "room-test-bravo-987654321";
  const ownerB = hashRoomKey(testRoomB);

  function makeSampleGame(id: string, overrides: Partial<Parameters<typeof saveStageGame>[1]> = {}) {
    return {
      id,
      ownerKey: ownerA,
      site: "manual",
      round: 1,
      playedOn: "2026-10-22",
      mySide: "r" as const,
      me: { name: "Kì thủ Đỏ", points: "1500", title: "Tập Sự", stars: 1 },
      opponent: { name: "Kì thủ Đen", points: "1480", title: "Tập Sự", stars: 0 },
      result: "win" as const,
      resultSource: "manual" as const,
      startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
      moves: [
        { from: 24, to: 25, notation: "P2-5" },
        { from: 72, to: 71, notation: "M8+7" },
      ],
      plies: 2,
      timeControl: "10p+5s",
      startedAt: new Date("2026-10-22T08:00:00Z"),
      endedAt: new Date("2026-10-22T08:15:00Z"),
      ...overrides,
    };
  }

  describe("hashRoomKey", () => {
    it("tạo hash sha256 64 ký tự hex và ổn định", () => {
      const h1 = hashRoomKey("my-room-123456");
      const h2 = hashRoomKey("my-room-123456");
      expect(h1).toHaveLength(64);
      expect(h1).toBe(h2);
      expect(h1).not.toBe(hashRoomKey("another-room"));
    });
  });

  describe("saveStageGame & getStageGame", () => {
    it("lưu ván mới và đọc lại chính xác theo id và ownerKey", async () => {
      const gameInput = makeSampleGame("stg_001");
      const saved = await saveStageGame(db, gameInput);
      expect(saved.id).toBe("stg_001");
      expect(saved.ownerKey).toBe(ownerA);
      expect(saved.me.name).toBe("Kì thủ Đỏ");

      const loaded = await getStageGame(db, "stg_001", ownerA);
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe("stg_001");
      expect(loaded?.opponent.name).toBe("Kì thủ Đen");
      expect(loaded?.moves).toEqual(gameInput.moves);
    });

    it("ngăn chặn phòng khác ghi đè ván cờ đã lưu của phòng mình", async () => {
      const game = makeSampleGame("stg_safe_1");
      await saveStageGame(db, game);

      const attackerGame = makeSampleGame("stg_safe_1", {
        ownerKey: ownerB,
        result: "loss",
      });

      await expect(saveStageGame(db, attackerGame)).rejects.toThrow(/thuộc về phòng khác/);

      const original = await getStageGame(db, "stg_safe_1", ownerA);
      expect(original?.result).toBe("win");
      expect(original?.ownerKey).toBe(ownerA);
    });

    it("từ chối hoặc trả về null nếu ownerKey không khớp", async () => {
      await saveStageGame(db, makeSampleGame("stg_002"));

      const wrongOwner = await getStageGame(db, "stg_002", ownerB);
      expect(wrongOwner).toBeNull();

      const correctOwner = await getStageGame(db, "stg_002", ownerA);
      expect(correctOwner).not.toBeNull();
    });

    it("upsert idempotent: gọi lưu nhiều lần cùng id sẽ cập nhật kết quả mà không tạo dòng mới", async () => {
      const initial = makeSampleGame("stg_003", { result: null, plies: 4 });
      await saveStageGame(db, initial);

      const updated = makeSampleGame("stg_003", {
        result: "loss",
        resultSource: "board",
        plies: 10,
        endedAt: new Date("2026-10-22T08:25:00Z"),
      });
      await saveStageGame(db, updated);

      const fetched = await getStageGame(db, "stg_003", ownerA);
      expect(fetched?.result).toBe("loss");
      expect(fetched?.resultSource).toBe("board");
      expect(fetched?.plies).toBe(10);
      expect(fetched?.endedAt.toISOString()).toBe(new Date("2026-10-22T08:25:00Z").toISOString());
    });

    it("lưu kèm userId khi người dùng đang đăng nhập", async () => {
      const user = await insertUser(db);
      const gameInput = makeSampleGame("stg_auth", { userId: user.id });
      await saveStageGame(db, gameInput);

      const loaded = await getStageGame(db, "stg_auth");
      expect(loaded?.userId).toBe(user.id);
    });
  });

  describe("listStageGames", () => {
    beforeEach(async () => {
      // Tạo 3 ván cho ownerA và 1 ván cho ownerB
      await saveStageGame(
        db,
        makeSampleGame("game_1", {
          playedOn: "2026-10-21",
          result: "win",
          opponent: { name: "QuangTrung", points: "1600" },
          endedAt: new Date("2026-10-21T10:00:00Z"),
        }),
      );
      await saveStageGame(
        db,
        makeSampleGame("game_2", {
          playedOn: "2026-10-22",
          result: "loss",
          opponent: { name: "TranHungDao", points: "1700" },
          endedAt: new Date("2026-10-22T11:00:00Z"),
        }),
      );
      await saveStageGame(
        db,
        makeSampleGame("game_3", {
          playedOn: "2026-10-22",
          result: "win",
          opponent: { name: "LeLoi", points: "1550" },
          endedAt: new Date("2026-10-22T14:00:00Z"),
        }),
      );
      await saveStageGame(
        db,
        makeSampleGame("game_B", {
          ownerKey: ownerB,
          playedOn: "2026-10-22",
          result: "win",
          opponent: { name: "NguoiLa", points: "1200" },
          endedAt: new Date("2026-10-22T12:00:00Z"),
        }),
      );
    });

    it("chỉ trả về danh sách ván thuộc đúng ownerKey", async () => {
      const resA = await listStageGames(db, ownerA);
      expect(resA.games).toHaveLength(3);
      expect(resA.games.map((g) => g.id)).toEqual(["game_3", "game_2", "game_1"]);

      const resB = await listStageGames(db, ownerB);
      expect(resB.games).toHaveLength(1);
      expect(resB.games[0].id).toBe("game_B");
    });

    it("lọc theo ngày playedOn", async () => {
      const res = await listStageGames(db, ownerA, { date: "2026-10-22" });
      expect(res.games).toHaveLength(2);
      expect(res.games.map((g) => g.id)).toEqual(["game_3", "game_2"]);
    });

    it("lọc theo kết quả result", async () => {
      const resWin = await listStageGames(db, ownerA, { result: "win" });
      expect(resWin.games).toHaveLength(2);
      expect(resWin.games.map((g) => g.id)).toEqual(["game_3", "game_1"]);

      const resLoss = await listStageGames(db, ownerA, { result: "loss" });
      expect(resLoss.games).toHaveLength(1);
      expect(resLoss.games[0].id).toBe("game_2");
    });

    it("tìm kiếm theo tên đối thủ (case-insensitive)", async () => {
      const res = await listStageGames(db, ownerA, { q: "hungdao" });
      expect(res.games).toHaveLength(1);
      expect(res.games[0].id).toBe("game_2");
    });

    it("hỗ trợ phân trang bằng cursor", async () => {
      const page1 = await listStageGames(db, ownerA, { limit: 2 });
      expect(page1.games).toHaveLength(2);
      expect(page1.games.map((g) => g.id)).toEqual(["game_3", "game_2"]);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await listStageGames(db, ownerA, { limit: 2, cursor: page1.nextCursor! });
      expect(page2.games).toHaveLength(1);
      expect(page2.games[0].id).toBe("game_1");
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe("stage_game_analysis persistence & cascade", () => {
    it("lưu và đọc lại kết quả phân tích theo gameId", async () => {
      await saveStageGame(db, makeSampleGame("g_eval_1"));
      const evals = [
        { score: 30, best: { from: 10, to: 20 }, depth: 10 },
        { score: -80, best: null, depth: 10 },
      ];

      expect(await getStageAnalysis(db, "g_eval_1")).toBeNull();

      await saveStageAnalysis(db, "g_eval_1", evals);
      const loaded = await getStageAnalysis(db, "g_eval_1");
      expect(loaded).toEqual(evals);
    });

    it("tự động cascade xóa phân tích khi xóa ván stage_games", async () => {
      await saveStageGame(db, makeSampleGame("g_cascade"));
      await saveStageAnalysis(db, "g_cascade", [{ score: 50, best: null }]);

      expect(await getStageAnalysis(db, "g_cascade")).not.toBeNull();

      await db.delete(stageGames);
      expect(await getStageAnalysis(db, "g_cascade")).toBeNull();
    });
  });
});
