// Bước 3: chọn thế từ .data/puzzle-mining/verified.jsonl và ghi src/lib/xiangqi/puzzles-deep.generated.ts.
//   npx tsx scripts/build-deep-puzzles.ts           ghi file dữ liệu
//   npx tsx scripts/build-deep-puzzles.ts --list    in bảng ứng viên (để duyệt / dịch tên)
// Ưu tiên thế khó với người tính được ~3 nước: có nước êm (không chiếu), có thí quân, nhiều nguồn sách khác nhau.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyMove, inCheck, parseFen, PIECE_VALUES, typeOf, type Move, type Position } from "../src/lib/xiangqi/engine";
import { moveNotation } from "../src/lib/xiangqi/notation";
import { uciToMove } from "../src/lib/xiangqi/uci";
import { BOOKS, CHAPTERS, PICKS } from "./deep-puzzle-picks";

const DIR = path.join(process.cwd(), ".data", "puzzle-mining");
const OUT = path.join(process.cwd(), "src", "lib", "xiangqi", "puzzles-deep.generated.ts");

interface Verified { file: string; title: string; fen: string; ok: boolean; depth: number; line: string[] }

export interface Features {
  depth: number;
  /** Số nước Đỏ không chiếu tướng. */
  quiet: number;
  /** Số lần Đen ăn quân Đỏ vừa đi (Đỏ thí quân). */
  sacrifices: number;
  /** Giá trị quân Đỏ đã thí. */
  sacValue: number;
  firstQuiet: boolean;
  firstSac: boolean;
  pieces: number;
  firstPiece: string;
}

export function features(fen: string, line: Move[]): Features {
  let pos: Position = parseFen(fen);
  const f: Features = {
    depth: (line.length + 1) / 2, quiet: 0, sacrifices: 0, sacValue: 0, firstQuiet: false, firstSac: false,
    pieces: pos.board.filter(Boolean).length, firstPiece: typeOf(pos.board[line[0].from]!),
  };
  line.forEach((m, i) => {
    const before = pos;
    pos = applyMove(pos, m);
    if (i % 2 === 0) {
      if (!inCheck(pos.board, "b")) {
        f.quiet++;
        if (i === 0) f.firstQuiet = true;
      }
    } else if (line[i - 1].to === m.to && before.board[m.to]) {
      const t = typeOf(before.board[m.to]!);
      if (t !== "p") {
        f.sacrifices++;
        f.sacValue += PIECE_VALUES[t];
        if (i === 1) f.firstSac = true;
      }
    }
  });
  return f;
}

const load = (): Verified[] =>
  existsSync(path.join(DIR, "verified.jsonl"))
    ? readFileSync(path.join(DIR, "verified.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r: Verified) => r.ok)
    : [];

export const bookOf = (file: string) => BOOKS.find((b) => file.includes(b.key))?.name ?? "Tuyển tập sát cục";

function notation(fen: string, line: Move[]) {
  let pos = parseFen(fen);
  return line.map((m) => {
    const s = moveNotation(pos.board, m);
    pos = applyMove(pos, m);
    return s;
  });
}

const NAME: Record<string, string> = { r: "Xe", n: "Mã", c: "Pháo", p: "Tốt", k: "Tướng", a: "Sĩ", b: "Tượng" };

function hint(f: Features) {
  const who = NAME[f.firstPiece];
  if (f.firstSac) return `Nước đầu: ${who} thí quân để mở đường.`;
  if (f.firstQuiet) return `Nước đầu đi ${who}, không chiếu tướng: chặn đường thoát trước đã.`;
  return `Nước đầu đi ${who} chiếu tướng${f.sacrifices ? "; sẽ phải thí quân ở giữa biến" : ""}.`;
}

function main() {
  const all = load();
  const byFen = new Map(all.map((r) => [r.fen, r]));
  if (process.argv.includes("--list")) {
    const rows = all.map((r) => ({ r, f: features(r.fen, r.line.map((u) => uciToMove(u)!)) }));
    rows.sort((a, b) => a.f.depth - b.f.depth || b.f.quiet + b.f.sacrifices - (a.f.quiet + a.f.sacrifices));
    for (const { r, f } of rows) {
      console.log([f.depth, f.quiet, f.sacrifices, f.pieces, bookOf(r.file), r.title || "-", r.file, r.fen].join("\t"));
    }
    return;
  }
  const out: string[] = [];
  const ids = new Set<string>();
  for (const pick of PICKS) {
    const r = byFen.get(pick.fen);
    if (!r) throw new Error(`Không có thế đã kiểm chứng: ${pick.fen}`);
    const line = r.line.map((u) => uciToMove(u)!);
    const f = features(r.fen, line);
    const chapter = CHAPTERS.find((c) => f.depth >= c.min && f.depth <= c.max);
    if (!chapter) throw new Error(`Không có chương cho thế ${f.depth} nước`);
    const id = `${chapter.prefix}-${String(out.filter((o) => o.includes(`"${chapter.name}"`)).length + 1).padStart(2, "0")}`;
    if (ids.has(id)) throw new Error(id);
    ids.add(id);
    const source = [bookOf(r.file), pick.original].filter(Boolean).join(" · ");
    const p = {
      id, chapter: chapter.name, depth: f.depth, title: pick.title,
      goal: `Đỏ đi trước, chiếu bí trong ${f.depth} nước.`, fen: r.fen, hint: pick.hint ?? hint(f),
      solution: line[0], solutionText: notation(r.fen, line).join(" "), line, source,
    };
    out.push(`  ${JSON.stringify(p)},`);
  }
  // Giữ thứ tự chương rồi độ khó trong chương như trong PICKS.
  const order = (s: string) => CHAPTERS.findIndex((c) => s.includes(`"chapter":"${c.name}"`));
  out.sort((a, b) => order(a) - order(b));
  writeFileSync(
    OUT,
    `// Tự sinh bởi scripts/build-deep-puzzles.ts — đừng sửa tay. Kiểm chứng trong puzzle-data.test.ts.\n` +
      `// Thế lấy từ sách cổ / tuyển tập sát cục (data/kypho-raw/qp), lời giải tìm lại và kiểm chứng bằng Pikafish.\n\n` +
      `import type { Puzzle } from "./puzzles";\n\nexport const DEEP_PUZZLES: Puzzle[] = [\n${out.join("\n")}\n];\n`,
  );
  console.log(`ghi ${out.length} thế vào ${path.relative(process.cwd(), OUT)}`);
}

main();
