import { describe, expect, it } from "vitest";
import { play, sq, type Board, type Move } from "./engine";
import { checkDatDungViTri, checkLechHuong, inferTheater, sectorName } from "./direction";
import { detectAllZhaoTactics, detectDatDungViTri } from "./zhao-principles";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({ from: sq(fr, fc), to: sq(tr, tc) });
function board(pieces: Record<string, string>): Board {
  const b: Board = Array(90).fill(null);
  for (const [key, p] of Object.entries(pieces)) {
    const [r, c] = key.split(",").map(Number);
    b[sq(r, c)] = p;
  }
  return b;
}

describe("direction — Triệu Hâm Hâm bài 24: Đặt đúng quân vào đúng vị trí", () => {
  describe("inferTheater / sectorName", () => {
    it("đặt tên chiến trường theo lộ của từng bên", () => {
      expect(sectorName("center", "r")).toBe("trung lộ");
      expect(sectorName("right", "r")).toBe("cánh lộ 1–3");
      expect(sectorName("right", "b")).toBe("cánh lộ 7–9");
      expect(sectorName("left", "b")).toBe("cánh lộ 1–3");
    });

    it("biến chỉ có một nước của bên đi thì chưa đủ để nói phương hướng", () => {
      const b = board({ "9,4": "K", "0,4": "k", "7,4": "C", "0,0": "r" });
      expect(inferTheater(b, "r", [mv(7, 4, 6, 4)])).toBeNull();
    });
  });

  // Ý bài giảng: Binh đã bình vào lộ 6 để phong tỏa trung lộ, Xe lại bỏ trung lộ ra biên ăn Tốt (Xe 4 bình 1);
  // nước đúng phương hướng là Xe 4 thoái 2 giữ trung lộ.
  describe("checkLechHuong (chê)", () => {
    const before = board({
      "9,4": "K", "3,5": "R", "3,3": "P", "7,6": "N", "7,4": "C",
      "0,4": "k", "0,3": "a", "0,5": "a", "0,0": "r", "0,1": "n", "3,8": "p", "2,1": "c", "0,8": "r",
    });
    const played = mv(3, 5, 3, 8); // Xe 4 bình 1 ăn Tốt biên
    const best = mv(3, 5, 5, 5); // Xe 4 thoái 2
    const pvPlayed = [mv(0, 1, 2, 2), mv(7, 6, 5, 5), mv(2, 2, 4, 3), mv(5, 5, 4, 3)];
    const pvBest = [best, mv(0, 1, 2, 2), mv(7, 6, 5, 7), mv(2, 2, 4, 3), mv(5, 5, 4, 5)];
    const after = play(before, played);
    const options = { pv: pvPlayed, loss: 120, evalBefore: { score: 150, best, pv: pvBest }, evalAfter: { score: -30 } };

    it("qua đủ bốn tầng: Xe rời trung lộ trong khi biến tốt nhất dồn quân vào đó", () => {
      const r = checkLechHuong(before, played, after, options);
      expect(r).toMatchObject({ ok: true });
      if (!r?.ok) return;
      expect(r.summary).toContain("Lệch hướng");
      expect(r.summary).toContain("trung lộ");
      expect(r.summary).toContain("tuy ăn được Tốt");
      expect(r.summary).toContain("X4/2");
    });

    it("detector gắn lời chê vào bài 24 và lời chê che mọi lời khen khác", () => {
      const f = detectDatDungViTri(before, played, after, options);
      expect(f).toMatchObject({ tactic: "datDungViTri", tone: "critique", lesson: 24 });
      const all = detectAllZhaoTactics(before, played, after, options);
      expect(all.every((x) => x.tone === "critique")).toBe(true);
    });

    it("tầng 1: biến tốt nhất không dồn về một chiến trường thì im", () => {
      const scattered = [best, mv(0, 1, 2, 2), mv(7, 6, 5, 7), mv(2, 2, 4, 3), mv(7, 4, 7, 0)];
      const r = checkLechHuong(before, played, after, { ...options, evalBefore: { score: 150, best, pv: scattered } });
      expect(r).toMatchObject({ ok: false });
    });

    it("tầng 2: Xe đang bị dọa thì rời đi là chạy quân, không phải lệch hướng", () => {
      const chased = { ...before.reduce<Record<string, string>>((o, p, i) => (p ? { ...o, [`${Math.floor(i / 9)},${i % 9}`]: p } : o), {}) };
      chased["1,6"] = "n"; // Mã đen bắt Xe ở 3,5 (Xe không căn)
      const b2 = board(chased);
      const quiet = mv(3, 5, 3, 8);
      const r = checkLechHuong(b2, quiet, play(b2, quiet), options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
    });

    it("tầng 3: không có biến engine thì không kết luận", () => {
      const r = checkLechHuong(before, played, after, { ...options, evalAfter: undefined });
      expect(r).toMatchObject({ ok: false, layer: 3 });
    });

    it("tầng 4: nước đi không thiệt rõ thì không chê", () => {
      const r = checkLechHuong(before, played, after, { ...options, loss: 20 });
      expect(r).toMatchObject({ ok: false, layer: 4 });
    });

    it("chính là nước tốt nhất thì không xét", () => {
      expect(checkLechHuong(before, best, play(before, best), { ...options, loss: 0 })).toBeNull();
    });
  });

  // Ý bài giảng: Mã lộ 3 không căn là đích cho đối phương; đặt quân làm căn cho nó (Pháo 2 bình 9) thì kỳ hình chỉnh tề.
  describe("checkDatDungViTri (khen)", () => {
    const before = board({
      "9,4": "K", "8,4": "A", "9,8": "R", "7,6": "N", "6,0": "P", "6,2": "P",
      "0,4": "k", "0,3": "a", "0,5": "a", "0,6": "r", "3,0": "p", "3,2": "p", "0,1": "n", "2,1": "c", "9,1": "N",
    });
    const move = mv(9, 8, 9, 6); // Xe về lộ 3 làm căn cho Mã
    const alt = mv(6, 2, 5, 2);
    const pv = [mv(3, 0, 4, 0), mv(6, 2, 5, 2), mv(3, 2, 3, 1), mv(6, 0, 5, 0), mv(0, 3, 1, 4)];
    const after = play(before, move);
    const options = {
      pv,
      loss: 0,
      evalBefore: {
        score: 50,
        best: move,
        pv: [move, ...pv],
        lines: [{ best: move, score: 50, pv: [move, ...pv] }, { best: alt, score: -20, pv: [alt] }],
      },
      evalAfter: { score: -50 },
    };

    it("qua đủ bốn tầng: nước lặng làm căn cho Mã không căn, hơn rõ nước tự nhiên thứ hai", () => {
      const r = checkDatDungViTri(before, move, after, options);
      expect(r).toMatchObject({ ok: true });
      if (!r?.ok) return;
      expect(r.summary).toContain("làm căn cho Mã");
      expect(r.summary).toContain("kém 70 điểm");
    });

    it("detector gắn lời khen vào bài 24", () => {
      expect(detectDatDungViTri(before, move, after, options)).toMatchObject({ tactic: "datDungViTri", lesson: 24 });
    });

    it("tầng 4: nước thứ hai gần như ngang thì không khen", () => {
      const close = { ...options, evalBefore: { ...options.evalBefore, lines: [options.evalBefore.lines[0], { best: alt, score: 30, pv: [alt] }] } };
      expect(checkDatDungViTri(before, move, after, close)).toMatchObject({ ok: false, layer: 4 });
    });

    it("tầng 3: quân vừa đặt bị ăn trong biến thì không khen", () => {
      const lost = { ...options, pv: [mv(0, 6, 9, 6), ...pv.slice(1)] };
      expect(checkDatDungViTri(before, move, after, lost)).toMatchObject({ ok: false, layer: 3 });
    });

    it("không phải nước tốt nhất, hoặc không có MultiPV, thì không xét", () => {
      expect(checkDatDungViTri(before, move, after, { ...options, evalBefore: { ...options.evalBefore, best: alt } })).toBeNull();
      expect(checkDatDungViTri(before, move, after, { ...options, evalBefore: { ...options.evalBefore, lines: undefined } })).toBeNull();
    });
  });
});
