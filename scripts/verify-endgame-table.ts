// Kiểm chứng bảng tàn cuộc lý thuyết (endgame.ts VERIFIED_RULES) và giá trị Mã / Pháo (piece-value.ts) bằng Pikafish.
// Mỗi cấu hình: sinh thế ngẫu nhiên hợp lệ, Pikafish chấm có WDL, thống kê thắng / hòa / thua và điểm kỳ vọng của Đỏ.
// Ký hiệu quân: R Xe, N Mã, C Pháo, A Sĩ, B Tượng, P Tốt cao, L Tốt thấp (sát đáy), D Tốt đáy. Đỏ luôn là bên công.
// Chạy: npx tsx scripts/verify-endgame-table.ts [số mẫu mỗi cấu hình, mặc định 20] [ms mỗi thế, mặc định 1000]
// Cần engine/pikafish-windows.exe (hoặc pikafish-linux) và engine/pikafish.nnue.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { findKing, inCheck, toFen, type Board, type Side } from "../src/lib/xiangqi/engine";
import { hangingPieces } from "../src/lib/xiangqi/explain";
import { detectTheoreticalEndgame } from "../src/lib/xiangqi/endgame";

const SAMPLES = Number(process.argv[2] ?? 20);
const MOVETIME = Number(process.argv[3] ?? 1000);
const ROOT = process.cwd();
const ENGINE = path.join(ROOT, "engine", process.platform === "win32" ? "pikafish-windows.exe" : "pikafish-linux");
const NNUE = path.join(ROOT, "engine", "pikafish.nnue");

// Cấu hình: quân Đỏ (bên tấn công) và quân Đen, chỉ ghi quân ngoài Tướng. P = Tốt cao đã qua sông.
const CONFIGS: { id: string; red: string; black: string }[] = [
  // Kiểm lại các thế đang có trong bảng
  { id: "R vs AABB (bảng: hòa)", red: "R", black: "AABB" },
  { id: "R vs AA (bảng: thắng)", red: "R", black: "AA" },
  { id: "R vs BB (bảng: thắng)", red: "R", black: "BB" },
  { id: "R vs C+A (bảng: thắng)", red: "R", black: "CA" },
  { id: "R vs N+AB (bảng: thắng)", red: "R", black: "NAB" },
  { id: "N+P cao vs AABB (bảng: thắng)", red: "NP", black: "AABB" },
  { id: "N+P cao+AABB vs AABB", red: "NPAABB", black: "AABB" },
  { id: "N+P thấp vs AABB (bảng: thắng)", red: "NL", black: "AABB" },
  { id: "C+P cao+AA vs AABB (bảng: thắng)", red: "CPAA", black: "AABB" },
  { id: "C+P cao+AABB vs AABB", red: "CPAABB", black: "AABB" },
  { id: "C+P cao+AABB vs AA", red: "CPAABB", black: "AA" },
  { id: "C+P cao+AABB vs BB", red: "CPAABB", black: "BB" },
  { id: "N+P cao vs AA", red: "NPAABB", black: "AA" },
  { id: "N vs - (bảng: thắng)", red: "N", black: "" },
  { id: "P vs A (bảng: hòa)", red: "P", black: "A" },
  // Thế mới
  { id: "R vs N+AABB", red: "RAABB", black: "NAABB" },
  { id: "R vs C+AABB", red: "RAABB", black: "CAABB" },
  { id: "R+P vs R+AABB", red: "RPAABB", black: "RAABB" },
  { id: "R+P vs R", red: "RPAABB", black: "R" },
  { id: "R+N vs R+AABB", red: "RNAABB", black: "RAABB" },
  { id: "R+C vs R+AABB", red: "RCAABB", black: "RAABB" },
  { id: "R+R vs R+AABB", red: "RRAABB", black: "RAABB" },
  { id: "N+C vs AABB", red: "NCAABB", black: "AABB" },
  { id: "N+N vs AABB", red: "NNAABB", black: "AABB" },
  { id: "C+C+AABB vs AABB", red: "CCAABB", black: "AABB" },
  { id: "C+C vs AABB (không Sĩ Tượng)", red: "CC", black: "AABB" },
  { id: "C+P vs AABB (không ngòi)", red: "CP", black: "AABB" },
  { id: "P+P vs AABB", red: "PPAABB", black: "AABB" },
  { id: "N+P vs N+AABB", red: "NPAABB", black: "NAABB" },
  { id: "C+P+AABB vs C+AABB", red: "CPAABB", black: "CAABB" },
  { id: "N+P cao vs AA (Đỏ không Sĩ Tượng)", red: "NP", black: "AA" },
  { id: "N+P cao+AABB vs BB", red: "NPAABB", black: "BB" },
  { id: "N+P cao+AABB vs AB", red: "NPAABB", black: "AB" },
  { id: "N+P cao+AABB vs AAB", red: "NPAABB", black: "AAB" },
  { id: "N+P cao+AABB vs ABB", red: "NPAABB", black: "ABB" },
  { id: "C+P cao+AABB vs AB", red: "CPAABB", black: "AB" },
  { id: "C+P cao+AABB vs AAB", red: "CPAABB", black: "AAB" },
  { id: "C+P cao+AABB vs ABB", red: "CPAABB", black: "ABB" },
  { id: "R+N+AABB vs R", red: "RNAABB", black: "R" },
  { id: "R+C+AABB vs R", red: "RCAABB", black: "R" },
  // Đo giá trị Mã / Pháo theo giai đoạn: Đỏ có Mã, Đen có Pháo, còn lại như nhau.
  { id: "[giá trị] N+P+AABB vs C+P+AABB", red: "NPAABB", black: "CPAABB" },
  { id: "[giá trị] N+PP+AABB vs C+PP+AABB", red: "NPPAABB", black: "CPPAABB" },
  { id: "[giá trị] R+N+PP+AABB vs R+C+PP+AABB", red: "RNPPAABB", black: "RCPPAABB" },
  { id: "[giá trị] RRNC+PPP+AABB vs RRCC+PPP+AABB", red: "RRNCPPPAABB", black: "RRCCPPPAABB" },
  { id: "[giá trị] RRNNC+PPPP+AABB vs RRNCC+PPPP+AABB", red: "RRNNCPPPPAABB", black: "RRNCCPPPPAABB" },
  { id: "N+C vs AABB (Đỏ không Sĩ Tượng)", red: "NC", black: "AABB" },
  { id: "N+N vs AABB (Đỏ không Sĩ Tượng)", red: "NN", black: "AABB" },
  { id: "R+P vs R (Đỏ không Sĩ Tượng)", red: "RP", black: "R" },
  { id: "R+P+AABB vs R+A", red: "RPAABB", black: "RA" },
  { id: "R+P+AABB vs R+B", red: "RPAABB", black: "RB" },
  { id: "C+C+AA vs AABB", red: "CCAA", black: "AABB" },
  { id: "C+P đáy+AABB vs AABB", red: "CDAABB", black: "AABB" },
  { id: "C+P thấp+AABB vs AABB", red: "CLAABB", black: "AABB" },
  { id: "N+P đáy+AABB vs AA", red: "NDAABB", black: "AA" },
  { id: "R+P đáy+AABB vs R", red: "RDAABB", black: "R" },
  { id: "[giá trị] N+P vs C+P (không Sĩ Tượng)", red: "NP", black: "CP" },
  { id: "[giá trị] N+PP vs C+PP (không Sĩ Tượng)", red: "NPP", black: "CPP" },
  { id: "[giá trị] N+PPP vs C+PPP (không Sĩ Tượng)", red: "NPPP", black: "CPPP" },
  { id: "[giá trị] N+PP+A vs C+PP+A (mỗi bên 1 Sĩ)", red: "NPPA", black: "CPPA" },
  { id: "[giá trị] R+N+P vs R+C+P (không Sĩ Tượng)", red: "RNP", black: "RCP" },
  { id: "[giá trị] R+N+PP+AABB vs R+C+PP+AABB (lặp lại)", red: "RNPPAABB", black: "RCPPAABB" },
];

const ADVISOR: Record<Side, number[]> = { b: [3, 5, 13, 21, 23], r: [84, 86, 76, 66, 68] };
const ELEPHANT: Record<Side, number[]> = { b: [2, 6, 18, 22, 26, 38, 42], r: [87, 83, 71, 67, 63, 47, 51] };
const PALACE: Record<Side, number[]> = { b: [3, 4, 5, 12, 13, 14, 21, 22, 23], r: [66, 67, 68, 75, 76, 77, 84, 85, 86] };
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function squaresFor(ch: string, s: Side): number[] {
  const t = ch.toLowerCase();
  if (t === "a") return ADVISOR[s];
  if (t === "b") return ELEPHANT[s];
  if (t === "p" || t === "l" || t === "d") {
    // P = Tốt cao (hàng Tốt / hàng sông / đỉnh cung đối phương), L = Tốt thấp (hàng sát đáy), D = Tốt đáy (Tốt già)
    const rows = t === "d" ? (s === "r" ? [0] : [9]) : t === "l" ? (s === "r" ? [1] : [8]) : s === "r" ? [2, 3, 4] : [5, 6, 7];
    return rows.flatMap((r) => Array.from({ length: 9 }, (_, c) => r * 9 + c));
  }
  return Array.from({ length: 90 }, (_, i) => i);
}

function randomPosition(red: string, black: string, turn: Side): Board | null {
  for (let tries = 0; tries < 2000; tries++) {
    const b: Board = Array(90).fill(null);
    b[rnd(PALACE.r)] = "K";
    b[rnd(PALACE.b)] = "k";
    let ok = true;
    for (const [pieces, s] of [[red, "r"], [black, "b"]] as const) {
      for (const ch of pieces) {
        const free = squaresFor(ch, s).filter((i) => !b[i]);
        if (!free.length) { ok = false; break; }
        const piece = "ld".includes(ch.toLowerCase()) ? "p" : ch.toLowerCase();
        b[rnd(free)] = s === "r" ? piece.toUpperCase() : piece;
      }
    }
    if (!ok) continue;
    const rk = findKing(b, "r"), bk = findKing(b, "b");
    if (rk % 9 === bk % 9) {
      let between = 0;
      for (let i = bk + 9; i < rk; i += 9) if (b[i]) between++;
      if (between === 0) continue; // lộ mặt Tướng
    }
    if (inCheck(b, "r") || inCheck(b, "b")) continue;
    if (hangingPieces(b, "r").length || hangingPieces(b, "b").length) continue;
    void turn;
    return b;
  }
  return null;
}

class Engine {
  proc: ChildProcessWithoutNullStreams;
  buf = "";
  waiter: ((l: string) => void) | null = null;
  constructor() {
    this.proc = spawn(ENGINE, [], { cwd: path.dirname(ENGINE) });
    this.proc.stdout.on("data", (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.waiter?.(line);
      }
    });
    this.send("uci");
    this.send(`setoption name EvalFile value ${NNUE}`);
    this.send("setoption name Threads value 1");
    this.send("setoption name Hash value 64");
    this.send("setoption name UCI_ShowWDL value true");
  }
  send(c: string) { this.proc.stdin.write(c + "\n"); }
  evaluate(fen: string): Promise<{ cp: number | null; mate: number | null; wdl: number[] | null }> {
    return new Promise((resolve) => {
      let last = { cp: null as number | null, mate: null as number | null, wdl: null as number[] | null };
      this.waiter = (line) => {
        if (line.startsWith("info") && line.includes(" score ")) {
          const cp = /score cp (-?\d+)/.exec(line);
          const mate = /score mate (-?\d+)/.exec(line);
          const wdl = /wdl (\d+) (\d+) (\d+)/.exec(line);
          last = { cp: cp ? +cp[1] : null, mate: mate ? +mate[1] : null, wdl: wdl ? [+wdl[1], +wdl[2], +wdl[3]] : last.wdl };
        } else if (line.startsWith("bestmove")) {
          this.waiter = null;
          resolve(last);
        }
      };
      this.send("ucinewgame");
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${MOVETIME}`);
    });
  }
}

type Verdict = "win" | "draw" | "loss" | "unclear";
function verdictForRed(r: { cp: number | null; mate: number | null; wdl: number[] | null }, turn: Side): Verdict {
  const sign = turn === "r" ? 1 : -1;
  if (r.mate !== null) return r.mate * sign > 0 ? "win" : "loss";
  if (!r.wdl) return "unclear";
  const [w, d, l] = turn === "r" ? r.wdl : [r.wdl[2], r.wdl[1], r.wdl[0]];
  if (w >= 850) return "win";
  if (l >= 850) return "loss";
  if (d >= 700) return "draw";
  return "unclear";
}

async function main() {
  const engines = Array.from({ length: 3 }, () => new Engine());
  const jobs: { cfg: string; fen: string; turn: Side; table: string }[] = [];
  for (const cfg of CONFIGS) {
    for (let k = 0; k < SAMPLES; k++) {
      const turn: Side = k % 2 === 0 ? "r" : "b";
      const b = randomPosition(cfg.red, cfg.black, turn);
      if (!b) continue;
      const eg = detectTheoreticalEndgame(b);
      jobs.push({ cfg: cfg.id, fen: `${toFen({ board: b, turn })} - - 0 1`, turn, table: eg ? `${eg.outcome}:${eg.id}` : "-" });
    }
  }
  const results: Record<string, Record<Verdict, number> & { table: Set<string>; examples: string[]; esum?: number; en?: number }> = {};
  let next = 0;
  await Promise.all(engines.map(async (e) => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const r = await e.evaluate(job.fen);
      const v = verdictForRed(r, job.turn);
      const agg = (results[job.cfg] ??= { win: 0, draw: 0, loss: 0, unclear: 0, table: new Set(), examples: [] });
      agg[v]++; const sgn = job.turn === "r"; const w = r.wdl ? (sgn ? r.wdl : [r.wdl[2], r.wdl[1], r.wdl[0]]) : null; if (w) { agg.esum = (agg.esum ?? 0) + (w[0] + w[1] / 2) / 1000; agg.en = (agg.en ?? 0) + 1; }
      agg.table.add(job.table);
      if (agg.examples.length < 3 && v !== "win") agg.examples.push(`${v} ${job.fen} ${JSON.stringify(r)}`);
    }
    e.send("quit");
  }));
  const lines: string[] = [];
  for (const cfg of CONFIGS) {
    const a = results[cfg.id];
    if (!a) continue;
    lines.push(`${cfg.id.padEnd(34)} thắng ${a.win} | hòa ${a.draw} | thua ${a.loss} | chưa rõ ${a.unclear} | điểm kỳ vọng Đỏ ${a.en ? (a.esum! / a.en).toFixed(3) : "-"} | bảng hiện tại: ${[...a.table].join(",")}`);
  }
  console.log(lines.join("\n"));
}
main();
