// Engine cờ tướng mạnh chạy trên server (mặc định Pikafish) qua giao thức UCI.
// Dùng cho máy cấp Trung bình trở lên, phân tích ván và huấn luyện. Cấp dễ vẫn dùng AI JavaScript trên trình duyệt.
//
// Cấu hình (biến môi trường):
//   ENGINE_PATH       đường dẫn file chạy engine (mặc định engine/pikafish-windows.exe hoặc engine/pikafish-linux)
//   ENGINE_EVAL_FILE  file mạng nơ-ron (mặc định engine/pikafish.nnue cạnh file chạy)
//   ENGINE_POOL       số tiến trình engine chạy song song (mặc định 2)
//   ENGINE_HASH       bộ nhớ đệm Hash (MB) cho mỗi tiến trình engine (mặc định 128 MB)
// LƯU Ý giấy phép: Pikafish là GPL-3 (chạy trên server, không phân phối là ổn), nhưng pikafish.nnue
// "No commercial use without permission". Trước khi thương mại: xin phép, hoặc đổi sang engine có trọng số
// cho phép thương mại (vd. Fairy-Stockfish, trọng số cờ tướng CC0) bằng ENGINE_PATH/ENGINE_EVAL_FILE.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { inCheck, legalMoves, opponent, parseFen, type Board, type Move, type Position, type Side } from "@/lib/xiangqi/engine";
import { explainMove, type Fact } from "@/lib/xiangqi/explain";
import { moveNotation } from "@/lib/xiangqi/notation";
import { winChance } from "@/lib/xiangqi/analysis";
import { engineScore, moveToUci, toUciFen, uciMovesToMoves, uciToMove } from "@/lib/xiangqi/uci";

export interface EngineLimits {
  /** Giới hạn số thế cờ tính (dùng để làm yếu máy ở cấp thấp). */
  nodes?: number;
  movetime?: number;
  depth?: number;
  /** Số biến đánh giá song song (mặc định 1, phân tích dùng 3). */
  multipv?: number;
}

export interface EngineLine {
  multipv: number;
  cp: number | null;
  mate: number | null;
  depth: number;
  bestmove: string | null;
  pv: string[];
  /** Tỉ lệ thắng/hòa/thua (phần nghìn) do engine tự báo: [thắng, hòa, thua] */
  wdl?: [number, number, number];
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
  /** Danh sách các biến khi chạy MultiPV. */
  lines?: EngineLine[];
  /** Tỉ lệ thắng/hòa/thua (phần nghìn) do engine tự báo: [thắng, hòa, thua] */
  wdl?: [number, number, number];
}

export interface ThreatResult {
  /** Nước cờ đối phương đang đe dọa đi. */
  threatMove: Move | null;
  /** Tọa độ UCI của nước đe dọa (vd: "h2e2"). */
  threatUci: string | null;
  /** Ký hiệu tiếng Việt của nước đe dọa (vd: "P2-5"). */
  threatNotation: string | null;
  /** Điểm của bên đe dọa (dương = đối phương có đòn đánh nguy hiểm). */
  score: number;
  /** Chuỗi biến đối phương khai thác nếu được đi tiếp. */
  pv: Move[];
  pvUci: string[];
  /** Có phải đòn đe dọa chiếu bí trực tiếp hay không. */
  isMate: boolean;
  /** Bên đang đe dọa ('r' hoặc 'b'). */
  opponent: Side;
  /** Bên bị đe dọa hiện đang bị chiếu sẵn hay không. */
  inCheck?: boolean;
}

export interface RefuteResult {
  /** Nước đi bị chất vấn / kiểm tra. */
  move: Move;
  moveUci: string;
  moveNotation: string;
  /** Nước này có phải là nước tốt nhất không. */
  isBest: boolean;
  /** Điểm của nước này theo người đi. */
  score: number;
  /** Điểm của nước tốt nhất. */
  bestScore: number;
  /** Điểm mất đi so với nước tốt nhất (centipawn). */
  scoreLoss: number;
  /** Mức giảm xác suất thắng (0.0 đến 1.0). */
  winDrop: number;
  /** Nước phản đòn / trừng phạt mạnh nhất của đối phương. */
  refutationMove: Move | null;
  refutationUci: string | null;
  refutationNotation: string | null;
  /** Chuỗi biến tiếp diễn trừng phạt sai lầm. */
  pv: Move[];
  pvUci: string[];
  /** Các dữ kiện chiến thuật / cạm bẫy giải thích vì sao nước bị bác bỏ. */
  facts: Fact[];
}

export function defaultEnginePath(): string | null {
  const fromEnv = process.env.ENGINE_PATH;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  const file = process.platform === "win32" ? "pikafish-windows.exe" : "pikafish-linux";
  const p = path.join(process.cwd(), "engine", file);
  return existsSync(p) ? p : null;
}

/** Phân tích một dòng "info ..." của UCI. Hỗ trợ wdl (win/draw/loss). */
export function parseInfo(line: string): {
  depth?: number;
  cp?: number;
  mate?: number;
  multipv?: number;
  pv?: string[];
  wdl?: [number, number, number];
} {
  const t = line.split(/\s+/);
  const out: {
    depth?: number;
    cp?: number;
    mate?: number;
    multipv?: number;
    pv?: string[];
    wdl?: [number, number, number];
  } = {};
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "depth") out.depth = Number(t[i + 1]);
    else if (t[i] === "multipv") out.multipv = Number(t[i + 1]);
    else if (t[i] === "score" && t[i + 1] === "cp") out.cp = Number(t[i + 2]);
    else if (t[i] === "score" && t[i + 1] === "mate") out.mate = Number(t[i + 2]);
    else if (t[i] === "wdl") {
      const w = Number(t[i + 1]);
      const d = Number(t[i + 2]);
      const l = Number(t[i + 3]);
      if (!Number.isNaN(w) && !Number.isNaN(d) && !Number.isNaN(l)) {
        out.wdl = [w, d, l];
      }
    } else if (t[i] === "pv") {
      out.pv = t.slice(i + 1).filter((s) => /^[a-i][0-9][a-i][0-9]$/.test(s));
      break;
    }
  }
  return out;
}

/**
 * Tính thời gian timeout tối đa cho lệnh tìm kiếm dựa trên số nodes hoặc movetime.
 * Tránh trường hợp lượt phân tích sâu (1M - 3M nodes) bị cắt ngang bởi timeout cố định.
 */
export function computeSearchTimeoutMs(limits: EngineLimits): number {
  if (limits.movetime) {
    return limits.movetime + 10_000;
  }
  if (limits.nodes) {
    // Dự trù tối thiểu 25k nodes/giây trên CPU yếu + 15 giây đệm
    const estimatedMs = Math.ceil((limits.nodes / 25_000) * 1000);
    return Math.max(15_000, estimatedMs + 15_000);
  }
  if (limits.depth) {
    const estimatedMs = Math.pow(1.5, Math.min(22, limits.depth)) * 60;
    return Math.max(15_000, estimatedMs + 15_000);
  }
  return 30_000;
}

function playMove(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

/** Một tiến trình engine. Mỗi lúc chỉ chạy một lệnh tìm kiếm. */
export class UciProcess {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private listeners: ((line: string) => void)[] = [];
  private currentMultiPv = 1;
  dead = false;
  ready: Promise<void>;

  constructor(exe: string) {
    const evalFile = process.env.ENGINE_EVAL_FILE ?? path.join(path.dirname(exe), "pikafish.nnue");
    const hashMb = Math.max(16, Number(process.env.ENGINE_HASH ?? 128));
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
      this.send(`setoption name Hash value ${hashMb}`);
      this.send("setoption name UCI_ShowWDL value true");
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

  /** Gửi lệnh ucinewgame để bắt đầu ván mới và đồng bộ lại trạng thái. */
  async newGame(): Promise<void> {
    await this.ready;
    this.send("ucinewgame");
    this.send("isready");
    await this.waitFor((l) => l === "readyok", 10_000);
  }

  /**
   * Tìm kiếm nước đi tốt nhất cho thế cờ.
   * `options.newGame = true` chỉ gửi ucinewgame khi bắt đầu ván mới.
   * Các nước tiếp theo trong cùng ván không gửi ucinewgame để giữ ấm bộ nhớ đệm (Hash).
   */
  async search(
    fen: string,
    limits: EngineLimits,
    searchmoves?: string[],
    options?: { newGame?: boolean },
  ): Promise<EngineResult> {
    await this.ready;
    if (options?.newGame) {
      await this.newGame();
    }
    const targetMultiPv = limits.multipv ?? 1;
    if (this.currentMultiPv !== targetMultiPv) {
      this.send(`setoption name MultiPV value ${targetMultiPv}`);
      this.currentMultiPv = targetMultiPv;
    }
    const linesMap = new Map<number, EngineLine>();
    let last: { depth?: number; cp?: number; mate?: number; pv?: string[]; wdl?: [number, number, number] } = {};

    this.send(`position fen ${fen}`);
    const go = ["go"];
    if (limits.nodes) go.push("nodes", String(limits.nodes));
    if (limits.depth) go.push("depth", String(limits.depth));
    if (limits.movetime) go.push("movetime", String(limits.movetime));
    if (searchmoves?.length) go.push("searchmoves", ...searchmoves);
    this.send(go.join(" "));

    const timeoutMs = computeSearchTimeoutMs(limits);
    const line = await this.waitFor(
      (l) => l.startsWith("bestmove"),
      timeoutMs,
      (l) => {
        if (l.startsWith("info") && l.includes(" score ")) {
          const info = parseInfo(l);
          if (info.multipv !== undefined || info.pv !== undefined) {
            const mpv = info.multipv ?? 1;
            linesMap.set(mpv, {
              multipv: mpv,
              cp: info.mate !== undefined ? null : (info.cp ?? 0),
              mate: info.mate ?? null,
              depth: info.depth ?? 0,
              bestmove: info.pv?.[0] ?? null,
              pv: info.pv ?? [],
              wdl: info.wdl,
            });
            if (mpv === 1) {
              last = { ...last, ...info };
            }
          } else {
            last = { ...last, ...info };
          }
        }
      },
    );
    const move = line.split(/\s+/)[1];
    const lines = [...linesMap.values()].sort((a, b) => a.multipv - b.multipv);
    return {
      bestmove: move && move !== "(none)" ? move : null,
      cp: last.mate !== undefined ? null : (last.cp ?? 0),
      mate: last.mate ?? null,
      depth: last.depth ?? 0,
      pv: last.pv ?? lines[0]?.pv,
      lines: lines.length > 0 ? lines : undefined,
      wdl: last.wdl ?? lines[0]?.wdl,
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

  /**
   * Mượn một tiến trình engine để chạy chuỗi thao tác liên tục (vd: phân tích cả ván cờ).
   * Tự động hoàn trả hoặc tạo mới nếu tiến trình gặp sự cố.
   */
  async withProcess<T>(fn: (proc: UciProcess) => Promise<T>): Promise<T> {
    const p = await this.acquire();
    try {
      return await fn(p);
    } catch (err) {
      p.kill();
      throw err;
    } finally {
      this.release(p);
    }
  }

  /** Tắt mọi tiến trình đang rảnh (dùng khi dừng server / trong test). */
  close() {
    for (const p of this.idle) p.kill();
    this.idle = [];
    this.size = 0;
  }

  async search(
    fen: string,
    limits: EngineLimits,
    searchmoves?: string[],
    options?: { newGame?: boolean },
  ): Promise<EngineResult> {
    return this.withProcess((p) => p.search(fen, limits, searchmoves, options));
  }

  /**
   * API threat(fen): Đổi lượt đi (null-move) để xem đối phương đang muốn đi gì nếu bên hiện tại bỏ lượt.
   */
  async threat(fen: string, limits: EngineLimits = { nodes: 40_000, multipv: 1 }): Promise<ThreatResult> {
    const pos = parseFen(fen);
    const opp = opponent(pos.turn);
    const currentlyInCheck = inCheck(pos.board, pos.turn);

    if (currentlyInCheck) {
      // Bên đang đi đang bị chiếu sẵn -> đối phương đang có đòn chiếu trực tiếp
      return {
        threatMove: null,
        threatUci: null,
        threatNotation: "Đang bị chiếu tướng",
        score: 10_000,
        pv: [],
        pvUci: [],
        isMate: false,
        opponent: opp,
        inCheck: true,
      };
    }

    // Đổi lượt đi (null move)
    const nullMovePos: Position = {
      board: pos.board,
      turn: opp,
    };

    const res = await this.search(toUciFen(nullMovePos), limits);
    const threatMove = res.bestmove ? uciToMove(res.bestmove) : null;
    const threatNotation = threatMove ? moveNotation(pos.board, threatMove) : null;
    const pvMoves = res.pv ? uciMovesToMoves(res.pv) : [];
    const score = engineScore(res.cp, res.mate);
    const isMate = res.mate !== null && res.mate > 0;

    return {
      threatMove,
      threatUci: res.bestmove,
      threatNotation,
      score,
      pv: pvMoves,
      pvUci: res.pv ?? [],
      isMate,
      opponent: opp,
      inCheck: false,
    };
  }

  /**
   * API refute(fen, move): Dùng tuỳ chọn searchmoves để chỉ ra vì sao nước X không tốt,
   * so sánh với nước tốt nhất và tìm biến trừng phạt của đối phương.
   */
  async refute(
    fen: string,
    move: Move | string,
    limits: EngineLimits = { nodes: 60_000, multipv: 2 },
  ): Promise<RefuteResult> {
    const pos = parseFen(fen);
    const targetMove: Move = typeof move === "string" ? uciToMove(move)! : move;
    if (!targetMove) {
      throw new Error(`Nước đi không hợp lệ: ${String(move)}`);
    }
    const moveUci = typeof move === "string" ? move : moveToUci(move);
    const notation = moveNotation(pos.board, targetMove);

    // 1. Tìm nước tốt nhất của thế cờ ban đầu
    const bestRes = await this.search(toUciFen(pos), limits);
    const bestScore = engineScore(bestRes.cp, bestRes.mate);
    const isBest = bestRes.bestmove === moveUci;

    if (isBest) {
      const replyUci = bestRes.pv?.[1] ?? null;
      const replyMove = replyUci ? uciToMove(replyUci) : null;
      const afterBoard = playMove(pos.board, targetMove);
      const replyNotation = replyMove ? moveNotation(afterBoard, replyMove) : null;
      return {
        move: targetMove,
        moveUci,
        moveNotation: notation,
        isBest: true,
        score: bestScore,
        bestScore,
        scoreLoss: 0,
        winDrop: 0,
        refutationMove: replyMove,
        refutationUci: replyUci,
        refutationNotation: replyNotation,
        pv: bestRes.pv ? uciMovesToMoves(bestRes.pv) : [],
        pvUci: bestRes.pv ?? [],
        facts: [],
      };
    }

    // 2. Đánh giá riêng nước đi targetMove bằng searchmoves
    const moveRes = await this.search(toUciFen(pos), limits, [moveUci]);
    const moveScore = engineScore(moveRes.cp, moveRes.mate);
    const scoreLoss = Math.max(0, bestScore - moveScore);
    const winDrop = Math.max(0, winChance(bestScore) - winChance(moveScore));

    const afterBoard = playMove(pos.board, targetMove);
    let replyUci: string | null = moveRes.pv?.[1] ?? null;
    let replyMove: Move | null = replyUci ? uciToMove(replyUci) : null;

    // Nếu searchmoves không trả về nước đáp tiếp theo, tìm nước đáp từ sau nước đi
    if (!replyMove) {
      const oppTurn = opponent(pos.turn);
      const afterRes = await this.search(toUciFen({ board: afterBoard, turn: oppTurn }), limits);
      replyUci = afterRes.bestmove;
      replyMove = replyUci ? uciToMove(replyUci) : null;
    }

    const replyNotation = replyMove ? moveNotation(afterBoard, replyMove) : null;

    // 3. Rút trích các dữ kiện chiến thuật
    const facts = explainMove({
      before: pos.board,
      move: targetMove,
      after: afterBoard,
      evalBefore: { score: bestScore, best: bestRes.bestmove ? uciToMove(bestRes.bestmove) : null },
      evalAfter: { score: -moveScore, best: replyMove },
      loss: scoreLoss,
    });

    return {
      move: targetMove,
      moveUci,
      moveNotation: notation,
      isBest: false,
      score: moveScore,
      bestScore,
      scoreLoss,
      winDrop,
      refutationMove: replyMove,
      refutationUci: replyUci,
      refutationNotation: replyNotation,
      pv: moveRes.pv ? uciMovesToMoves(moveRes.pv) : [],
      pvUci: moveRes.pv ?? [],
      facts,
    };
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
