// Đọc bàn cờ từ ảnh chụp: dựng ảnh giống một trang cờ thật (lưới, quân tròn có chữ, đánh dấu nước vừa đi,
// nhiễu nén video, lưới lệch 1px do người dùng chọn góc không chuẩn) rồi cho MoveTracker theo dõi ván đại sư.

import { describe, expect, it } from "vitest";
import { MASTER_GAMES } from "@/lib/xiangqi/master-games.generated";
import { convertChineseGame } from "@/lib/xiangqi/chinese-notation";
import { Board, Move, Side, applyMove, initialPosition, parseFen } from "@/lib/xiangqi/engine";
import { m } from "@/test/xiangqi";
import { CELL_PX, GRID_H, GRID_W, MoveTracker, calibrate, extractPatches, sourceRect, screenToSquare } from "./board-reader";

type RGB = [number, number, number];
const BOARD: RGB = [233, 200, 142];
const LINE: RGB = [90, 52, 24];
const FACE: RGB = [243, 223, 182];
const EDGE: RGB = [156, 122, 74];
const RED: RGB = [179, 38, 30];
const BLACK: RGB = [30, 25, 21];
const HIGHLIGHT: RGB = [80, 200, 120];

// "Chữ" trên quân: mỗi loại một hình 5×5 khác nhau, như chữ Hán khác nhau trên quân thật.
const GLYPHS: Record<string, string[]> = {
  k: ["#####", "#...#", "#####", "#...#", "#####"],
  a: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  b: ["#####", "..#..", "#####", "..#..", "##.##"],
  n: ["##.##", "#..#.", "####.", "#..#.", "##.##"],
  r: ["#####", "..#..", "#.#.#", "..#..", "#####"],
  c: [".###.", "#...#", "#.#.#", "#...#", ".###."],
  p: ["..#..", "..#..", "#####", "..#..", "..#.."],
};

interface Frame {
  board: Board;
  bottom: Side;
  lastMove?: Move | null;
  /** Quân đang trượt: vẽ ở giữa đường đi, ô xuất phát đã trống. */
  sliding?: { move: Move; piece: string; t: number };
  /** Lưới lệch vài px (chọn góc không chuẩn). */
  shift?: number;
  noise?: number;
  seed?: number;
}

function render(f: Frame): Uint8ClampedArray {
  const img = new Uint8ClampedArray(GRID_W * GRID_H * 4);
  const shift = f.shift ?? 0;
  let seed = f.seed ?? 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const set = (x: number, y: number, c: RGB, alpha = 1) => {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
    const o = (y * GRID_W + x) * 4;
    for (let k = 0; k < 3; k++) img[o + k] = img[o + k] * (1 - alpha) + c[k] * alpha;
    img[o + 3] = 255;
  };
  const center = (screen: number) => ({
    x: (screen % 9) * CELL_PX + CELL_PX / 2 + shift,
    y: Math.floor(screen / 9) * CELL_PX + CELL_PX / 2 + shift,
  });
  const screenOf = (square: number) => (f.bottom === "r" ? square : 89 - square);

  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) set(x, y, BOARD);
  for (let r = 0; r < 10; r++) {
    const y = Math.round(r * CELL_PX + CELL_PX / 2 + shift);
    for (let x = CELL_PX / 2; x <= GRID_W - CELL_PX / 2; x++) set(Math.round(x + shift), y, LINE);
  }
  for (let c = 0; c < 9; c++) {
    const x = Math.round(c * CELL_PX + CELL_PX / 2 + shift);
    for (let y = CELL_PX / 2; y <= GRID_H - CELL_PX / 2; y++) {
      const row = (y - CELL_PX / 2) / CELL_PX;
      if (c > 0 && c < 8 && row > 4 && row < 5) continue; // sông
      set(x, Math.round(y + shift), LINE);
    }
  }
  // Ô đánh dấu nước vừa đi (nhiều trang tô màu ô đi và ô đến).
  if (f.lastMove) {
    for (const s of [f.lastMove.from, f.lastMove.to]) {
      const { x, y } = center(screenOf(s));
      for (let dy = -11; dy <= 11; dy++) for (let dx = -11; dx <= 11; dx++) set(Math.round(x + dx), Math.round(y + dy), HIGHLIGHT, 0.3);
    }
  }
  const drawPiece = (cx: number, cy: number, piece: string) => {
    const ink = piece === piece.toUpperCase() ? RED : BLACK;
    const glyph = GLYPHS[piece.toLowerCase()];
    const R = CELL_PX * 0.46;
    for (let dy = -12; dy <= 12; dy++) {
      for (let dx = -12; dx <= 12; dx++) {
        const dd = Math.hypot(dx, dy);
        if (dd > R) continue;
        let col = dd > R - 2 ? EDGE : FACE;
        const gx = Math.floor((dx + 7.5) / 3);
        const gy = Math.floor((dy + 7.5) / 3);
        if (gx >= 0 && gx < 5 && gy >= 0 && gy < 5 && glyph[gy][gx] === "#") col = ink;
        set(Math.round(cx + dx), Math.round(cy + dy), col);
      }
    }
  };
  f.board.forEach((p, s) => {
    if (!p) return;
    // Quân đang trượt vẽ riêng ở dưới; quân bị ăn (nếu có) vẫn hiện tới khi quân kia tới nơi.
    if (f.sliding && (s === f.sliding.move.from || s === f.sliding.move.to)) return;
    const { x, y } = center(screenOf(s));
    drawPiece(x, y, p);
  });
  if (f.sliding) {
    const { move, piece, t } = f.sliding;
    const captured = f.board[move.to];
    if (captured) {
      const c = center(screenOf(move.to));
      drawPiece(c.x, c.y, captured);
    }
    const a = center(screenOf(move.from));
    const b = center(screenOf(move.to));
    drawPiece(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, piece);
  }
  const noise = f.noise ?? 6;
  for (let i = 0; i < img.length; i += 4) {
    for (let k = 0; k < 3; k++) img[i + k] = img[i + k] + (rand() - 0.5) * 2 * noise;
  }
  return img;
}

const start = initialPosition();
const patchesOf = (f: Frame) => extractPatches(render(f));

describe("hiệu chỉnh từ thế cờ ban đầu", () => {
  it.each<Side>(["r", "b"])("tự nhận ra phe ngồi dưới là %s và tin cậy cao", (bottom) => {
    const cal = calibrate(patchesOf({ board: start.board, bottom, shift: 1 }), start.board);
    expect(cal.bottom).toBe(bottom);
    expect(cal.confidence).toBeGreaterThan(0.95);
  });

  it("báo tin cậy thấp khi trang kia đang ở giữa ván chứ không phải thế ban đầu", () => {
    const mid = convertChineseGame(MASTER_GAMES[0].movesCN).positions[20];
    const cal = calibrate(patchesOf({ board: mid.board, bottom: "r" }), start.board, "r");
    expect(cal.confidence).toBeLessThan(0.8);
  });

  it("vùng cắt từ ảnh gốc: giao điểm góc nằm giữa ô đầu tiên của ảnh chuẩn hóa", () => {
    expect(sourceRect({ x0: 100, y0: 50, x1: 500, y1: 500 })).toEqual({ sx: 75, sy: 25, sw: 450, sh: 500 });
    expect(screenToSquare(0, "b")).toBe(89);
  });
});

function trackerFor(bottom: Side) {
  const cal = calibrate(patchesOf({ board: start.board, bottom, shift: 1, seed: 7 }), start.board);
  return new MoveTracker(cal.templates, cal.bottom, start);
}

/** Đưa một khung hình vào hai lần (hai nhịp chụp liên tiếp, ảnh đã đứng yên) và gom các nước phát hiện được. */
function feedStable(t: MoveTracker, f: Frame): Move[] {
  return [...t.feed(patchesOf({ ...f, seed: 11 })), ...t.feed(patchesOf({ ...f, seed: 13 }))];
}

describe("theo dõi ván đại sư qua ảnh chụp", () => {
  it.each<[number, Side]>([
    [0, "r"],
    [1, "b"],
  ])("ván %i, phe %s ngồi dưới: đọc đúng từng nước, kể cả khi đang có hiệu ứng quân trượt", (gameIdx, bottom) => {
    const game = convertChineseGame(MASTER_GAMES[gameIdx].movesCN);
    const plies = Math.min(game.moves.length, 60);
    const t = trackerFor(bottom);
    const seen: Move[] = [];
    for (let i = 0; i < plies; i++) {
      const before = game.positions[i].board;
      const move = game.moves[i];
      // Khung chụp giữa lúc quân đang trượt: không được nhận nhầm nước dừng giữa đường.
      seen.push(...t.feed(patchesOf({ board: before, bottom, lastMove: game.moves[i - 1], sliding: { move, piece: before[move.from]!, t: 0.5 }, shift: 1 })));
      seen.push(...feedStable(t, { board: game.positions[i + 1].board, bottom, lastMove: move, shift: 1 }));
      expect(seen.length, `nước ${i + 1}`).toBe(i + 1);
    }
    expect(seen).toEqual(game.moves.slice(0, plies));
    expect(t.position.board).toEqual(game.positions[plies].board);
  });

  it("khung chụp đúng lúc xe trượt qua giao điểm giữa đường: chờ ảnh đứng yên, không nhận nhầm xe đi 1 ô", () => {
    // Xe ra hàng 8 (ô vốn trống, đã có mẫu ô trống riêng), đen đáp, rồi xe trượt ngang 2 ô qua (8,1).
    const t = trackerFor("r");
    const setup = [m(9, 0, 8, 0), m(0, 0, 1, 0)];
    let p = start;
    for (const mv of setup) {
      p = applyMove(p, mv);
      expect(feedStable(t, { board: p.board, bottom: "r", lastMove: mv, shift: 1 })).toEqual([mv]);
    }
    const move = m(8, 0, 8, 2);
    expect(t.feed(patchesOf({ board: p.board, bottom: "r", lastMove: setup[1], sliding: { move, piece: "R", t: 0.5 }, shift: 1 }))).toEqual([]);
    expect(feedStable(t, { board: applyMove(p, move).board, bottom: "r", lastMove: move, shift: 1 })).toEqual([move]);
  });

  it("không báo nước nào khi ảnh không đổi", () => {
    const t = trackerFor("r");
    expect(feedStable(t, { board: start.board, bottom: "r", shift: 1 })).toEqual([]);
    expect(feedStable(t, { board: start.board, bottom: "r", shift: 1, noise: 12 })).toEqual([]);
  });

  it("hai bên đi liền trong một nhịp chụp, ăn qua ăn lại cùng một ô: vẫn ra đúng hai nước", () => {
    // Pháo đỏ ăn mã đen, xe đen ăn lại pháo trên cùng ô: chỉ nhìn ảnh cuối thì nước đơn nào cũng không khớp.
    const t = trackerFor("r");
    const red = m(7, 1, 0, 1);
    const black = m(0, 0, 0, 1);
    const after = applyMove(applyMove(start, red), black);
    expect(feedStable(t, { board: after.board, bottom: "r", lastMove: black, shift: 1 })).toEqual([red, black]);
  });

  it("ảnh lệch hẳn (chọn sai vùng) thì không bịa ra nước đi", () => {
    const t = trackerFor("r");
    const other = parseFen("4k4/9/9/9/9/9/9/9/9/4K4 w");
    expect(feedStable(t, { board: other.board, bottom: "r" })).toEqual([]);
  });
});
