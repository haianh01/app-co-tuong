// Đọc bàn cờ từ ảnh chụp: dựng ảnh giống một trang cờ thật (lưới, quân tròn có chữ, đánh dấu nước vừa đi,
// nhiễu nén video, lưới lệch 1px do người dùng chọn góc không chuẩn) rồi cho MoveTracker theo dõi ván đại sư.

import { describe, expect, it } from "vitest";
import { MASTER_GAMES } from "@/lib/xiangqi/master-games.generated";
import { convertChineseGame } from "@/lib/xiangqi/chinese-notation";
import { Board, Move, Side, applyMove, initialPosition, parseFen } from "@/lib/xiangqi/engine";
import { m } from "@/test/xiangqi";
import { CELL_PX, GRID_H, GRID_W, MoveTracker, calibrate, extractPatches, sourceRect, screenToSquare, toBoardOrder } from "./board-reader";
import { learnLibrary, mergeLibrary, parseLibrary, readBoard, serializeLibrary } from "./piece-library";

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
    expect(cal.misplaced).toBe(0);
  });

  it("trang kia đã đi một nước trước khi bấm theo dõi: tin cậy vẫn cao nhưng phát hiện được ô sai", () => {
    // Đỏ pháo 2 bình 5 rồi mới bấm: chỉ 2 ô khác, `confidence` không đủ để chặn.
    const moved = applyMove(start, m(7, 7, 7, 4));
    const cal = calibrate(patchesOf({ board: moved.board, bottom: "r", shift: 1, lastMove: m(7, 7, 7, 4) }), start.board, "r");
    expect(cal.confidence).toBeGreaterThan(0.85);
    expect(cal.misplaced).toBeGreaterThan(0);
    expect(cal.mismatchedSquares).toBeDefined();
    expect(cal.mismatchedSquares!.length).toBeGreaterThan(0);
  });

  it("báo tin cậy thấp khi trang kia đang ở giữa ván chứ không phải thế ban đầu", () => {
    const mid = convertChineseGame(MASTER_GAMES[0].movesCN).positions[20];
    const cal = calibrate(patchesOf({ board: mid.board, bottom: "r" }), start.board, "r");
    expect(cal.confidence).toBeLessThan(0.8);
  });

  it.each<Side>(["r", "b"])(
    "bắt đầu giữa ván (người dùng đã tự đi tới thế này), phe %s ngồi dưới: đoán đúng hướng và theo được các nước tiếp theo",
    (bottom) => {
      const game = convertChineseGame(MASTER_GAMES[0].movesCN);
      const k = 24;
      const mid = game.positions[k];
      const cal = calibrate(patchesOf({ board: mid.board, bottom, shift: 1, lastMove: game.moves[k - 1], seed: 7 }), mid.board);
      expect(cal.bottom).toBe(bottom);
      expect(cal.misplaced).toBe(0);
      const t = new MoveTracker(cal.templates, cal.bottom, mid);
      const seen: Move[] = [];
      for (let i = k; i < k + 20; i++) {
        seen.push(...feedStable(t, { board: game.positions[i + 1].board, bottom, lastMove: game.moves[i], shift: 1 }));
      }
      expect(seen).toEqual(game.moves.slice(k, k + 20));
    },
  );

  it("bàn cờ ở đây còn thiếu một nước so với trang kia: phát hiện được ô sai", () => {
    const game = convertChineseGame(MASTER_GAMES[0].movesCN);
    const cal = calibrate(patchesOf({ board: game.positions[25].board, bottom: "r", shift: 1 }), game.positions[24].board, "r");
    expect(cal.misplaced).toBeGreaterThan(0);
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

  it("mất hình một lúc (chuyển sang cửa sổ khác) trong khi ván bên kia đi tiếp 5 nước: đọc bù đủ cả 5 rồi theo tiếp", () => {
    const game = convertChineseGame(MASTER_GAMES[0].movesCN);
    const t = trackerFor("r");
    for (let i = 0; i < 10; i++) feedStable(t, { board: game.positions[i + 1].board, bottom: "r", lastMove: game.moves[i], shift: 1 });
    expect(t.position.board).toEqual(game.positions[10].board);
    // Trong lúc khung chụp hiện thứ khác (ở đây: một thế cờ chẳng liên quan), không được bịa nước.
    const other = parseFen("4k4/9/9/9/9/9/9/9/9/4K4 w");
    expect(feedStable(t, { board: other.board, bottom: "r" })).toEqual([]);
    expect(feedStable(t, { board: game.positions[15].board, bottom: "r", lastMove: game.moves[14], shift: 1 })).toEqual(
      game.moves.slice(10, 15),
    );
    expect(feedStable(t, { board: game.positions[16].board, bottom: "r", lastMove: game.moves[15], shift: 1 })).toEqual([game.moves[15]]);
  });

});

describe("đọc bù nhiều nước nhờ dấu nước vừa đi của trang kia", () => {
  // Bốn nước đọc từng nước một để học dấu "nước vừa đi" (ô tô màu ở ô đi và ô đến), xong tới lượt Đỏ.
  const opening = [m(7, 7, 7, 4), m(0, 7, 2, 6), m(9, 7, 7, 6), m(0, 1, 2, 2)];
  function learned() {
    const t = trackerFor("r");
    let p = start;
    for (const mv of opening) {
      p = applyMove(p, mv);
      expect(feedStable(t, { board: p.board, bottom: "r", lastMove: mv, shift: 1 })).toEqual([mv]);
    }
    return { t, p };
  }
  const play = (p: ReturnType<typeof initialPosition>, moves: Move[]) => moves.reduce((q, mv) => applyMove(q, mv), p);

  it.each([
    ["mã", [m(9, 8, 8, 8), m(3, 0, 4, 0), m(9, 1, 7, 2)]],
    ["xe", [m(9, 1, 7, 2), m(3, 0, 4, 0), m(9, 8, 8, 8)]],
  ])("hai nước Đỏ không liên quan nhau, nước cuối là %s: thứ tự theo dấu", (_, moves) => {
    const { t, p } = learned();
    const after = play(p, moves);
    expect(feedStable(t, { board: after.board, bottom: "r", lastMove: moves[2], shift: 1 })).toEqual(moves);
  });

  it("xe đi hai bước hay một bước ra cùng ảnh: dấu ở nước mã của Đỏ cho biết đã đi 5 nửa nước chứ không phải 4", () => {
    const { t, p } = learned();
    const moves = [m(9, 0, 8, 0), m(3, 0, 4, 0), m(8, 0, 7, 0), m(3, 2, 4, 2), m(9, 1, 7, 2)];
    const after = play(p, moves);
    const got = feedStable(t, { board: after.board, bottom: "r", lastMove: moves[4], shift: 1 });
    expect(got).toHaveLength(5);
    expect(got[4]).toEqual(moves[4]);
    expect(t.position.board).toEqual(after.board);
    expect(t.position.turn).toBe(after.turn);
  });
});

describe("ảnh không phải ván đang theo dõi", () => {
  it("ảnh lệch hẳn (chọn sai vùng) thì không bịa ra nước đi", () => {
    const t = trackerFor("r");
    const other = parseFen("4k4/9/9/9/9/9/9/9/9/4K4 w");
    expect(feedStable(t, { board: other.board, bottom: "r" })).toEqual([]);
  });
});

describe("trang kia sang ván mới", () => {
  it("ảnh về thế ban đầu giữa ván: tự theo dõi lại từ đầu rồi đọc tiếp ván mới", () => {
    const game = convertChineseGame(MASTER_GAMES[0].movesCN);
    const t = trackerFor("r");
    for (let i = 0; i < 10; i++) feedStable(t, { board: game.positions[i + 1].board, bottom: "r", lastMove: game.moves[i], shift: 1 });
    expect(t.position.board).toEqual(game.positions[10].board);

    expect(feedStable(t, { board: start.board, bottom: "r", shift: 1 })).toEqual([]);
    expect(t.last.restarted).toBe(true);
    expect(t.position.board).toEqual(start.board);

    const seen: Move[] = [];
    for (let i = 0; i < 6; i++) seen.push(...feedStable(t, { board: game.positions[i + 1].board, bottom: "r", lastMove: game.moves[i], shift: 1 }));
    expect(seen).toEqual(game.moves.slice(0, 6));
    expect(t.last.restarted).toBeFalsy();
  });

  it("nước đầu tiên của ván không bị tưởng là ván mới", () => {
    const game = convertChineseGame(MASTER_GAMES[0].movesCN);
    const t = trackerFor("r");
    expect(feedStable(t, { board: game.positions[1].board, bottom: "r", lastMove: game.moves[0], shift: 1 })).toEqual([game.moves[0]]);
    expect(t.last.restarted).toBeFalsy();
    expect(t.position.board).toEqual(game.positions[1].board);
  });
});

describe("thư viện hình quân: đọc thế cờ giữa ván không cần bày lại", () => {
  it.each<[number, number, Side]>([
    [0, 30, "r"],
    [1, 41, "b"],
    [2, 25, "r"],
  ])("ván %i, nước %i, phe %s ngồi dưới: học từ thế ban đầu, đọc đúng cả thế cờ", (gameIdx, ply, bottom) => {
    const startPatches = patchesOf({ board: start.board, bottom, shift: 1, seed: 7 });
    const cal = calibrate(startPatches, start.board);
    // Như app: gộp vào thư viện (có giới hạn số mẫu), lưu chuỗi, đọc lại.
    const learned = learnLibrary(toBoardOrder(startPatches, cal.bottom), start.board);
    const lib = parseLibrary(serializeLibrary(mergeLibrary(mergeLibrary(null, learned), learned)))!;
    const game = convertChineseGame(MASTER_GAMES[gameIdx].movesCN);
    const mid = game.positions[ply];
    const read = readBoard(patchesOf({ board: mid.board, bottom, lastMove: game.moves[ply - 1], shift: 1, seed: 21 }), lib);
    expect(read?.bottom).toBe(bottom);
    expect(read?.board).toEqual(mid.board);
  });

  it("thư viện chưa có mẫu ô trống / Tướng: không đoán bừa", () => {
    expect(readBoard(patchesOf({ board: start.board, bottom: "r" }), { samples: [] })).toBeNull();
  });
});

describe("khung hình bị che (thông báo, hiệu ứng đè lên bàn cờ)", () => {
  /** Đè một khối tối đặc lên các ô (theo thứ tự màn hình), như một thẻ thông báo che bàn cờ. */
  function cover(patches: Float32Array[], screens: number[]) {
    for (const i of screens) patches[i] = patches[i].map((_, k) => [0.11, 0.13, 0.12][k % 3]);
    return patches;
  }
  // Khối 3×4 ô giữa bàn phía Đỏ, che cả Pháo đỏ ở hàng 7.
  const BLOCK = [6, 7].flatMap((r) => [1, 2, 3, 4].map((c) => r * 9 + c)).concat([7 * 9 + 5, 7 * 9 + 6, 7 * 9 + 7]);

  it("thẻ thông báo che mất Pháo: không nhận thành nước ăn quân; bỏ che thì theo tiếp bình thường", () => {
    const game = convertChineseGame(MASTER_GAMES[0].movesCN);
    const t = trackerFor("r");
    for (let i = 0; i < 6; i++) feedStable(t, { board: game.positions[i + 1].board, bottom: "r", lastMove: game.moves[i], shift: 1 });
    const pos = game.positions[6];
    const covered = () => cover(patchesOf({ board: pos.board, bottom: "r", lastMove: game.moves[5], shift: 1, seed: 11 }), BLOCK);
    expect([...t.feed(covered()), ...t.feed(covered()), ...t.feed(covered())]).toEqual([]);
    expect(t.last.occluded).toBeGreaterThanOrEqual(2);
    expect(t.position.board).toEqual(pos.board);

    const seen: Move[] = [];
    for (let i = 6; i < 12; i++) seen.push(...feedStable(t, { board: game.positions[i + 1].board, bottom: "r", lastMove: game.moves[i], shift: 1 }));
    expect(seen).toEqual(game.moves.slice(6, 12));
  });

  it("đối phương đi đúng lúc đang bị che: chờ bỏ che rồi mới đọc nước đó", () => {
    const game = convertChineseGame(MASTER_GAMES[0].movesCN);
    const t = trackerFor("r");
    for (let i = 0; i < 4; i++) feedStable(t, { board: game.positions[i + 1].board, bottom: "r", lastMove: game.moves[i], shift: 1 });
    const after = game.positions[5];
    const covered = () => cover(patchesOf({ board: after.board, bottom: "r", lastMove: game.moves[4], shift: 1, seed: 11 }), BLOCK);
    expect([...t.feed(covered()), ...t.feed(covered())]).toEqual([]);
    expect(feedStable(t, { board: after.board, bottom: "r", lastMove: game.moves[4], shift: 1 })).toEqual([game.moves[4]]);
  });
});
