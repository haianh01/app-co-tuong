import { beforeEach, describe, expect, it } from "vitest";
import { insertUser, resetDb } from "@/test/db";
import { games } from "@/server/db/schema";
import {
  CURRENT_ANALYSIS_VERSION,
  FREE_ANALYSIS_PER_DAY,
  consumeAnalysisQuota,
  consumeStageAnalysisQuota,
  getAnalysisQuota,
  getSavedAnalysis,
  saveGameAnalysis,
} from "./store";
import type { Database } from "../db";

describe("server analysis store & quota", () => {
  let db: Database;

  beforeEach(async () => {
    db = await resetDb();
  });

  async function createTestGame(id: string) {
    const red = await insertUser(db);
    const black = await insertUser(db);
    await db.insert(games).values({
      id,
      redId: red.id,
      blackId: black.id,
      minutes: 10,
      winner: "r",
      reason: "checkmate",
      moves: [],
      plies: 0,
      redRatingBefore: 1500,
      blackRatingBefore: 1500,
      redRatingAfter: 1510,
      blackRatingAfter: 1490,
      startedAt: new Date(),
      endedAt: new Date(),
    });
  }

  describe("game_analysis persistence & versioning", () => {
    it("lưu và đọc lại kết quả phân tích theo gameId", async () => {
      await createTestGame("g12345");
      const evals = [
        { score: 100, best: { from: 10, to: 20 }, depth: 8 },
        { score: -50, best: null, depth: 8 },
      ];

      expect(await getSavedAnalysis(db, "g12345")).toBeNull();

      await saveGameAnalysis(db, "g12345", evals);
      const loaded = await getSavedAnalysis(db, "g12345");
      expect(loaded).toEqual(evals);
    });

    it("kết quả có version khác CURRENT_ANALYSIS_VERSION tự hết hiệu lực", async () => {
      await createTestGame("g_stale");
      const oldEvals = [{ score: 200, best: null }];
      // Lưu với version cũ (version = 0)
      await saveGameAnalysis(db, "g_stale", oldEvals, 0);

      // Đọc theo current version (1) phải ra null
      expect(await getSavedAnalysis(db, "g_stale")).toBeNull();

      // Lưu đè với current version thì đọc được
      const newEvals = [{ score: 250, best: null }];
      await saveGameAnalysis(db, "g_stale", newEvals, CURRENT_ANALYSIS_VERSION);
      expect(await getSavedAnalysis(db, "g_stale")).toEqual(newEvals);
    });
  });

  describe("quota theo user và IP", () => {
    it("user thường được tối đa 3 lượt phân tích mỗi ngày", async () => {
      const u = await insertUser(db);
      const userAuth = {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        rating: u.rating,
        isGuest: false,
        role: "user" as const,
        bannedUntil: null,
        banReason: null,
        email: null,
        emailVerified: false,
        coins: 0,
        vipUntil: null,
        avatar: u.avatar,
        frame: u.frame,
        boardSkin: u.boardSkin,
        pieceSkin: u.pieceSkin,
        hasPassword: false,
      };

      const initial = await getAnalysisQuota(db, userAuth, "1.2.3.4");
      expect(initial.allowed).toBe(true);
      expect(initial.remaining).toBe(FREE_ANALYSIS_PER_DAY);
      expect(initial.used).toBe(0);

      // Dùng 3 lần
      for (let i = 1; i <= 3; i++) {
        const res = await consumeAnalysisQuota(db, userAuth, "1.2.3.4");
        expect(res.success).toBe(true);
        expect(res.remaining).toBe(3 - i);
      }

      // Lần thứ 4 phải bị từ chối
      const fail = await consumeAnalysisQuota(db, userAuth, "1.2.3.4");
      expect(fail.success).toBe(false);
      expect(fail.remaining).toBe(0);

      const status = await getAnalysisQuota(db, userAuth, "1.2.3.4");
      expect(status.allowed).toBe(false);
      expect(status.used).toBe(3);
      expect(status.remaining).toBe(0);
    });

    it("VIP không bị giới hạn quota", async () => {
      const u = await insertUser(db, { vipUntil: new Date(Date.now() + 86_400_000) });
      const vipUser = {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        rating: u.rating,
        isGuest: false,
        role: "user" as const,
        bannedUntil: null,
        banReason: null,
        email: null,
        emailVerified: false,
        coins: 0,
        vipUntil: u.vipUntil,
        avatar: u.avatar,
        frame: u.frame,
        boardSkin: u.boardSkin,
        pieceSkin: u.pieceSkin,
        hasPassword: false,
      };

      const q = await getAnalysisQuota(db, vipUser, "1.2.3.4");
      expect(q.isVip).toBe(true);
      expect(q.allowed).toBe(true);
      expect(q.remaining).toBe(Infinity);

      // Gọi nhiều lần vẫn thành công
      for (let i = 0; i < 5; i++) {
        const res = await consumeAnalysisQuota(db, vipUser, "1.2.3.4");
        expect(res.success).toBe(true);
      }
    });

    it("khách chưa đăng nhập kiểm tra quota theo IP", async () => {
      const ipA = "192.168.1.10";
      const ipB = "192.168.1.20";

      // ipA dùng hết 3 lượt
      for (let i = 0; i < 3; i++) {
        const res = await consumeAnalysisQuota(db, null, ipA);
        expect(res.success).toBe(true);
      }
      expect((await consumeAnalysisQuota(db, null, ipA)).success).toBe(false);

      // ipB vẫn còn nguyên 3 lượt
      const statusB = await getAnalysisQuota(db, null, ipB);
      expect(statusB.allowed).toBe(true);
      expect(statusB.remaining).toBe(3);
    });

    it("hạn mức phân tích ván sân khấu riêng (25 lượt/ngày/phòng)", async () => {
      const ownerKey = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
      for (let i = 1; i <= 25; i++) {
        const res = await consumeStageAnalysisQuota(db, null, ownerKey, "1.2.3.4");
        expect(res.success).toBe(true);
        expect(res.remaining).toBe(25 - i);
      }

      // Lần thứ 26 phải bị từ chối
      const fail = await consumeStageAnalysisQuota(db, null, ownerKey, "1.2.3.4");
      expect(fail.success).toBe(false);
      expect(fail.remaining).toBe(0);
    });

    it("chặn lách quota ván sân khấu bằng việc đổi phòng liên tục trên cùng 1 IP (tối đa 50 lượt/ngày/IP)", async () => {
      const fixedIp = "118.69.100.50";
      // Chạy 50 lượt qua 2 phòng khác nhau
      for (let i = 0; i < 25; i++) {
        const res = await consumeStageAnalysisQuota(db, null, "room_key_alpha", fixedIp);
        expect(res.success).toBe(true);
      }
      for (let i = 0; i < 25; i++) {
        const res = await consumeStageAnalysisQuota(db, null, "room_key_beta", fixedIp);
        expect(res.success).toBe(true);
      }

      // Lượt 51 từ IP này (dù tạo phòng mới room_key_gamma) phải bị chặn
      const blocked = await consumeStageAnalysisQuota(db, null, "room_key_gamma", fixedIp);
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });
});
