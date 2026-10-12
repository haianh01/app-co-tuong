// Engine cờ tướng mạnh chạy trên server (mặc định Pikafish) qua giao thức UCI.
// Dùng cho máy cấp Trung bình trở lên, phân tích ván và huấn luyện. Cấp dễ vẫn dùng AI JavaScript trên trình duyệt.
//
// Cấu hình (biến môi trường):
//   ENGINE_PATH       đường dẫn file chạy engine (mặc định engine/pikafish-windows.exe hoặc engine/pikafish-linux)
//   ENGINE_EVAL_FILE  file mạng nơ-ron (mặc định engine/pikafish.nnue cạnh file chạy)
//   ENGINE_POOL       số tiến trình engine chạy song song (mặc định 2)
// LƯU Ý giấy phép: Pikafish là GPL-3 (chạy trên server, không phân phối là ổn), nhưng pikafish.nnue
// "No commercial use without permission". Trước khi thương mại: xin phép, hoặc đổi sang engine có trọng số
// cho phép thương mại (vd. Fairy-Stockfish, trọng số cờ tướng CC0) bằng ENGINE_PATH/ENGINE_EVAL_FILE.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface EngineLimits {
  /** Giới hạn số thế cờ tính (dùng để làm yếu máy ở cấp thấp). */
  nodes?: number;
  movetime?: number;
  depth?: number;
}

export interface EngineResult {
  /** Nước đi dạng UCI/ICCS, vd. "h2e2"; null khi hết nước. */
  bestmove: string | null;
  /** Điểm theo bên đang đi: centipawn, hoặc null nếu là thế chiếu bí. */
  cp: number | null;
  /** Số nước đến chiếu bí (dương = bên đang đi chiếu bí được). */
  mate: number | null;
  depth: number;
  /** Chuỗi biến chính (Principal Variation) dạng UCI/ICCS, vd. ["h2e2", "b9c7"]. */
  pv?: string[];
}

export function defaultEnginePath(): string | null {
  const fromEnv = process.env.ENGINE_PATH;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  const file = process.platform === "win32" ? "pikafish-windows.exe" : "pikafish-linux";
  const p = path.join(process.cwd(), "engine", file);
  return existsSync(p) ? p : null;
}

/** Phân tích một dòng "info ..." của UCI. */
export function parseInfo(line: string): { depth?: number; cp?: number; mate?: number; pv?: string[] } {
  const t = line.split(/\s+/);
  const out: { depth?: number; cp?: number; mate?: number; pv?: string[] } = {};
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "depth") out.depth = Number(t[i + 1]);
    else if (t[i] === "score" && t[i + 1] === "cp") out.cp = Number(t[i + 2]);
    else if (t[i] === "score" && t[i + 1] === "mate") out.mate = Number(t[i + 2]);
    else if (t[i] === "pv") {
      out.pv = t.slice(i + 1).filter((s) => /^[a-i][0-9][a-i][0-9]$/.test(s));
      break;
    }
  }
  return out;
}

/** Một tiến trình engine. Mỗi lúc chỉ chạy một lệnh tìm kiếm. */
class UciProcess {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private listeners: ((line: string) => void)[] = [];
  dead = false;
  ready: Promise<void>;

  constructor(exe: string) {
    const evalFile = process.env.ENGINE_EVAL_FILE ?? path.join(path.dirname(exe), "pikafish.nnue");
    this.proc = spawn(exe, [], { cwd: path.dirname(exe), stdio: "pipe" });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      let nl: number;
      while ((nl = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        for (const l of [...this.listeners]) l(line);
      }
    });
    this.proc.on("exit", () => {
      this.dead = true;
    });
    this.proc.on("error", () => {
      this.dead = true;
    });
    this.ready = (async () => {
      this.send("uci");
      await this.waitFor((l) => l === "uciok", 10_000);
      if (existsSync(evalFile)) this.send(`setoption name EvalFile value ${evalFile}`);
      this.send("setoption name Threads value 1");
      this.send("setoption name Hash value 32");
      this.send("isready");
      await this.waitFor((l) => l === "readyok", 30_000);
    })();
  }

  send(cmd: string) {
    if (!this.dead) this.proc.stdin.write(cmd + "\n");
  }

  waitFor(pred: (line: string) => boolean, timeoutMs: number, onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== fn);
        reject(new Error("Engine không trả lời"));
      }, timeoutMs);
      const fn = (line: string) => {
        onLine?.(line);
        if (!pred(line)) return;
        clearTimeout(timer);
        this.listeners = this.listeners.filter((l) => l !== fn);
        resolve(line);
      };
      this.listeners.push(fn);
    });
  }

  async search(fen: string, limits: EngineLimits, searchmoves?: string[]): Promise<EngineResult> {
    await this.ready;
    let last: { depth?: number; cp?: number; mate?: number; pv?: string[] } = {};
    this.send("ucinewgame");
    this.send(`position fen ${fen}`);
    const go = ["go"];
    if (limits.nodes) go.push("nodes", String(limits.nodes));
    if (limits.depth) go.push("depth", String(limits.depth));
    if (limits.movetime) go.push("movetime", String(limits.movetime));
    if (searchmoves?.length) go.push("searchmoves", ...searchmoves);
    this.send(go.join(" "));
    const line = await this.waitFor(
      (l) => l.startsWith("bestmove"),
      (limits.movetime ?? 5_000) + 10_000,
      (l) => {
        if (l.startsWith("info") && l.includes(" score ")) {
          const info = parseInfo(l);
          last = { ...last, ...info };
        }
      },
    );
    const move = line.split(/\s+/)[1];
    return {
      bestmove: move && move !== "(none)" ? move : null,
      cp: last.mate !== undefined ? null : (last.cp ?? 0),
      mate: last.mate ?? null,
      depth: last.depth ?? 0,
      pv: last.pv,
    };
  }

  kill() {
    this.dead = true;
    this.proc.kill();
  }
}

/** Nhóm tiến trình engine với hàng đợi; tiến trình chết thì tạo lại. */
export class EnginePool {
  private idle: UciProcess[] = [];
  private queue: ((p: UciProcess) => void)[] = [];
  private size = 0;

  constructor(private readonly exe: string, private readonly max: number) {}

  /** Số yêu cầu đang chờ (để từ chối sớm khi quá tải). */
  get waiting() {
    return this.queue.length;
  }

  private acquire(): Promise<UciProcess> {
    const p = this.idle.pop();
    if (p) return Promise.resolve(p);
    if (this.size < this.max) {
      this.size++;
      return Promise.resolve(new UciProcess(this.exe));
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  private release(p: UciProcess) {
    if (p.dead) {
      this.size--;
      const next = this.queue.shift();
      if (next) {
        this.size++;
        next(new UciProcess(this.exe));
      }
      return;
    }
    const next = this.queue.shift();
    if (next) next(p);
    else this.idle.push(p);
  }

  /** Tắt mọi tiến trình đang rảnh (dùng khi dừng server / trong test). */
  close() {
    for (const p of this.idle) p.kill();
    this.idle = [];
    this.size = 0;
  }

  async search(fen: string, limits: EngineLimits, searchmoves?: string[]): Promise<EngineResult> {
    const p = await this.acquire();
    try {
      return await p.search(fen, limits, searchmoves);
    } catch (err) {
      p.kill();
      throw err;
    } finally {
      this.release(p);
    }
  }
}

const globalForEngine = globalThis as unknown as { __enginePool?: EnginePool | null };

/** Nhóm engine dùng chung cho cả tiến trình (null nếu không có file engine). */
export function getEnginePool(): EnginePool | null {
  if (globalForEngine.__enginePool === undefined) {
    const exe = defaultEnginePath();
    globalForEngine.__enginePool = exe ? new EnginePool(exe, Math.max(1, Number(process.env.ENGINE_POOL ?? 2))) : null;
  }
  return globalForEngine.__enginePool;
}
