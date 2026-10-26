// Trình điều khiển Pikafish tối giản cho các script khai thác dữ liệu (không dùng trong app).
// Mỗi Engine là một tiến trình; search() trả về các biến MultiPV ở độ sâu cuối cùng.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const BIN = path.join(ROOT, "engine", process.platform === "win32" ? "pikafish-windows.exe" : "pikafish-linux");
const NNUE = path.join(ROOT, "engine", "pikafish.nnue");

export interface PvLine {
  multipv: number;
  depth: number;
  /** Số nước chiếu bí (dương: bên đang đi chiếu bí được; âm: bị chiếu bí). */
  mate: number | null;
  cp: number | null;
  pv: string[];
}

export class Engine {
  private proc: ChildProcessWithoutNullStreams;
  private buf = "";
  private waiters: ((line: string) => boolean)[] = [];

  constructor(hashMb = 64) {
    this.proc = spawn(BIN, [], { cwd: path.dirname(BIN) });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (d: string) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.waiters = this.waiters.filter((w) => !w(line));
      }
    });
    this.send("uci");
    this.send(`setoption name EvalFile value ${NNUE}`);
    this.send(`setoption name Hash value ${hashMb}`);
    this.send("setoption name Threads value 1");
  }

  private send(s: string) {
    this.proc.stdin.write(s + "\n");
  }

  private until(pred: (line: string) => boolean): Promise<void> {
    return new Promise((res) => this.waiters.push((l) => (pred(l) ? (res(), true) : false)));
  }

  async ready() {
    this.send("isready");
    await this.until((l) => l === "readyok");
  }

  /** Tìm kiếm từ FEN (đủ trường UCI). `go` ví dụ "depth 20" hoặc "nodes 1000000". */
  async search(fen: string, go: string, multipv = 1, searchmoves: string[] = []): Promise<PvLine[]> {
    this.send("ucinewgame");
    this.send(`setoption name MultiPV value ${multipv}`);
    await this.ready();
    this.send(`position fen ${fen}`);
    const lines = new Map<number, PvLine>();
    const done = this.until((l) => {
      if (l.startsWith("info ") && l.includes(" pv ")) {
        const t = l.split(/\s+/);
        const at = (k: string) => t.indexOf(k);
        if (t.includes("lowerbound") || t.includes("upperbound")) return false;
        const mpv = at("multipv") >= 0 ? Number(t[at("multipv") + 1]) : 1;
        const s = at("score");
        lines.set(mpv, {
          multipv: mpv,
          depth: Number(t[at("depth") + 1]),
          mate: t[s + 1] === "mate" ? Number(t[s + 2]) : null,
          cp: t[s + 1] === "cp" ? Number(t[s + 2]) : null,
          pv: t.slice(at("pv") + 1),
        });
      }
      return l.startsWith("bestmove");
    });
    this.send(`go ${go}${searchmoves.length ? " searchmoves " + searchmoves.join(" ") : ""}`);
    await done;
    return [...lines.values()].sort((a, b) => a.multipv - b.multipv);
  }

  quit() {
    this.send("quit");
  }
}
