// Phân giai đoạn ván đấu và kế hoạch kỳ lý (B6):
// 1. Ranh giới 3 giai đoạn:
//    - Khai cuộc (khaiCuoc): từ ply 0 đến khi rời sách (roiSach) hoặc ra đủ quân lớn, muộn nhất ply 24.
//    - Trung cuộc (trungCuoc): giai đoạn giao tranh chiến thuật & chiến lược sau khai cuộc.
//    - Tàn cuộc (tanCuoc): bắt đầu khi tổng quân lớn (Xe, Mã, Pháo) còn <= 5 hoặc khớp tàn cuộc lý thuyết.
// 2. Làm mượt kế hoạch (smoothPlans): lọc nhiễu dao động của choosePlan qua cửa sổ trượt 6 nửa nước.
// 3. Sự kiện giai đoạn (events): roiSach, doiQuan, matQuan, buocNgoat, vaoTanCuocLyThuyet.
// Hoạt động thuần hàm, tất định (deterministic), không gọi engine bên trong.

import {
  type Board, type Side,
  sideOf, typeOf,
} from "./engine";
import { type PositionEval, winChance, winChanceFromWdl } from "./analysis";
import { detectTheoreticalEndgame } from "./endgame";
import type { GameState } from "./game";
import { detectExchange } from "./middlegame";
import { isBookMove } from "./openings";
import { choosePlan, type Plan } from "./strategy";

export type GamePhase = "khaiCuoc" | "trungCuoc" | "tanCuoc";

export type PhaseEventKind =
  | "doiQuan"
  | "matQuan"
  | "buocNgoat"
  | "roiSach"
  | "vaoTanCuocLyThuyet";

export interface PhaseEvent {
  ply: number;
  kind: PhaseEventKind;
  description: string;
}

export interface PhaseSummary {
  phase: GamePhase;
  fromPly: number;
  toPly: number;
  plan: Record<Side, Plan>;
  winStart: number;
  winEnd: number;
  initiative: Side | null;
  events: PhaseEvent[];
}

export interface DetectPhasesOptions {
  /** Danh sách đánh giá engine theo từng thế cờ (từ ply 0 đến ply N) */
  evaluations?: (PositionEval | null | undefined)[];
  /** Xác suất thắng của Đỏ (0.0 đến 1.0) theo từng thế cờ */
  winChances?: number[];
  /** Kích thước cửa sổ làm mượt kế hoạch (mặc định 6 nửa nước) */
  windowSize?: number;
  /** Nửa nước muộn nhất của giai đoạn khai cuộc (mặc định 24) */
  maxOpeningPly?: number;
}

const PIECE_VALUES: Record<string, number> = {
  k: 10_000,
  r: 900,
  c: 450,
  n: 400,
  b: 200,
  a: 200,
  p: 100,
};

/**
 * Đếm tổng số quân lớn (Xe, Mã, Pháo) còn lại trên bàn cờ của cả hai bên.
 */
export function countMajorPieces(board: Board): number {
  let count = 0;
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && "rnc".includes(typeOf(p))) {
      count++;
    }
  }
  return count;
}

/**
 * Kiểm tra xem cả hai bên đã hoàn thành việc ra quân lớn cơ bản chưa.
 * Vị trí ban đầu của quân lớn ở đáy:
 * - Đỏ: Xe (81, 89), Mã (82, 88), Pháo (64, 70)
 * - Đen: Xe (0, 8), Mã (1, 7), Pháo (19, 25)
 */
function areMajorPiecesDeveloped(board: Board): boolean {
  const redHomes = [81, 89, 82, 88];
  const blackHomes = [0, 8, 1, 7];

  const redUndeveloped = redHomes.filter((sq) => {
    const p = board[sq];
    return p && sideOf(p) === "r" && "rn".includes(typeOf(p));
  }).length;

  const blackUndeveloped = blackHomes.filter((sq) => {
    const p = board[sq];
    return p && sideOf(p) === "b" && "rn".includes(typeOf(p));
  }).length;

  // Cả hai bên đều đã xuất được phần lớn quân chủ lực ra khỏi vị trí xuất phát
  return redUndeveloped <= 1 && blackUndeveloped <= 1;
}

/**
 * Thuật toán làm mượt chuỗi kế hoạch theo cửa sổ trượt (sliding window majority vote).
 * Tránh việc kế hoạch bị nhảy giật giữa các nước đi liên tiếp.
 *
 * @param rawPlans Chuỗi kế hoạch thô theo từng nửa nước
 * @param windowSize Độ rộng cửa sổ làm mượt (mặc định 6 plies)
 */
export function smoothPlans(rawPlans: Plan[], windowSize: number = 6): Plan[] {
  const n = rawPlans.length;
  if (n === 0) return [];
  if (n <= 2) return [...rawPlans];

  const halfWin = Math.floor(windowSize / 2);
  const smoothed: Plan[] = [];

  for (let i = 0; i < n; i++) {
    let start = Math.max(0, i - halfWin);
    const end = Math.min(n, start + windowSize);
    if (end - start < windowSize) {
      start = Math.max(0, end - windowSize);
    }

    // Đếm tần suất xuất hiện của từng kế hoạch trong cửa sổ
    const counts = new Map<Plan, number>();
    for (let j = start; j < end; j++) {
      const p = rawPlans[j];
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }

    // Chọn kế hoạch có tần suất cao nhất
    let bestPlan = rawPlans[i];
    let maxCount = counts.get(bestPlan) ?? 0;

    for (const [plan, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        bestPlan = plan;
      }
    }

    smoothed.push(bestPlan);
  }

  return smoothed;
}

/**
 * Lấy kế hoạch chiếm đa số trong một khoảng nửa nước [fromPly, toPly].
 */
function getMajorityPlan(plans: Plan[], fromPly: number, toPly: number, defaultPlan: Plan): Plan {
  const slice = plans.slice(fromPly, Math.max(fromPly + 1, toPly + 1));
  if (slice.length === 0) return defaultPlan;

  const counts = new Map<Plan, number>();
  for (const p of slice) {
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }

  let bestPlan = slice[0];
  let maxCount = 0;
  for (const [plan, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      bestPlan = plan;
    }
  }
  return bestPlan;
}

/**
 * Trích xuất xác suất thắng của Đỏ (0.0 đến 1.0) tại một ply cụ thể.
 */
function getWinChanceAtPly(
  ply: number,
  options?: DetectPhasesOptions,
): number {
  if (options?.winChances && options.winChances.length > ply) {
    return options.winChances[ply];
  }

  const ev = options?.evaluations?.[ply];
  if (ev) {
    if (ev.wdl) {
      const pTurn = ply % 2 === 0 ? "r" : "b";
      const w = winChanceFromWdl(ev.wdl);
      return pTurn === "r" ? w : 1 - w;
    }
    const pTurn = ply % 2 === 0 ? "r" : "b";
    const scoreRed = pTurn === "r" ? ev.score : -ev.score;
    return winChance(scoreRed);
  }

  return 0.5; // Cân bằng mặc định
}

/**
 * Kế hoạch đã làm mượt của mỗi bên theo từng nửa nước (chỉ số 0..số nước đã đi).
 * Kế hoạch thô tính ở mỗi lượt Đỏ rồi giữ nguyên cho nửa nước của Đen để hai bên cùng nhịp.
 */
export function planSeries(state: GameState, windowSize: number = 6): Record<Side, Plan[]> {
  const totalPlies = state.moves.length;
  const rawPlansR: Plan[] = [];
  const rawPlansB: Plan[] = [];

  let lastPlanR: Plan = "raQuan";
  let lastPlanB: Plan = "raQuan";

  for (let i = 0; i <= totalPlies; i++) {
    if (i % 2 === 0 || i === totalPlies) {
      const b = state.history[i]?.board ?? state.history[state.history.length - 1].board;
      lastPlanR = choosePlan(b, "r", i);
      lastPlanB = choosePlan(b, "b", i);
    }
    rawPlansR.push(lastPlanR);
    rawPlansB.push(lastPlanB);
  }

  return { r: smoothPlans(rawPlansR, windowSize), b: smoothPlans(rawPlansB, windowSize) };
}

/**
 * Phân tích và chia ván cờ thành các giai đoạn: Khai cuộc, Trung cuộc, Tàn cuộc (`PhaseSummary`).
 *
 * @param state Trạng thái ván đấu hoàn chỉnh (history, moves)
 * @param options Tùy chọn hỗ trợ từ engine evaluations và cấu hình ranh giới
 */
export function detectPhases(
  state: GameState,
  options?: DetectPhasesOptions,
): PhaseSummary[] {
  const totalPlies = state.moves.length;
  const maxOpeningPly = options?.maxOpeningPly ?? 24;
  const windowSize = options?.windowSize ?? 6;

  const { r: smoothedPlansR, b: smoothedPlansB } = planSeries(state, windowSize);

  // 1. TÌM RANH GIỚI GIAI ĐOẠN
  let outOfBookPly: number | null = null;
  let devCompletedPly: number | null = null;
  let endgameStartPly: number | null = null;
  let endgameTheoryName: string | null = null;

  const playedNotations: string[] = [];

  // Duyệt từng nước để ghi nhận thời điểm rời sách và tàn cuộc
  for (let i = 0; i < totalPlies; i++) {
    const ply = i + 1;
    const m = state.moves[i];
    playedNotations.push(m.notation);

    // Kiểm tra rời sách khai cuộc
    if (outOfBookPly === null) {
      const inBook = isBookMove(playedNotations);
      if (!inBook) {
        outOfBookPly = ply;
      }
    }

    // Kiểm tra hoàn thành phát triển quân lớn
    if (devCompletedPly === null && ply <= maxOpeningPly) {
      if (areMajorPiecesDeveloped(state.history[ply].board)) {
        devCompletedPly = ply;
      }
    }

    // Kiểm tra bước vào tàn cuộc (majors <= 5 hoặc tàn cuộc lý thuyết)
    if (endgameStartPly === null) {
      const b = state.history[ply].board;
      const majors = countMajorPieces(b);
      const eg = detectTheoreticalEndgame(b);

      if (eg !== null) {
        endgameStartPly = ply;
        endgameTheoryName = eg.name;
      } else if (majors <= 5) {
        endgameStartPly = ply;
      }
    }
  }

  // Xác định điểm kết thúc Khai cuộc:
  // Khai cuộc kết thúc khi rời sách, hoặc khi ra đủ quân lớn, muộn nhất maxOpeningPly.
  let endOpeningPly = maxOpeningPly;
  if (outOfBookPly !== null && outOfBookPly >= 4) {
    endOpeningPly = Math.min(outOfBookPly, endOpeningPly);
  }
  if (devCompletedPly !== null && devCompletedPly >= 6) {
    endOpeningPly = Math.min(devCompletedPly, endOpeningPly);
  }
  endOpeningPly = Math.min(endOpeningPly, totalPlies);

  // Điểm bắt đầu Tàn cuộc (nếu có)
  const hasEndgame = endgameStartPly !== null && endgameStartPly <= totalPlies;
  const startEndgame = hasEndgame && endgameStartPly !== null ? Math.max(endOpeningPly, endgameStartPly) : totalPlies;

  // 2. PHÂN ĐỊNH DANH SÁCH SỰ KIỆN (events) THEO PLY
  const allEvents: PhaseEvent[] = [];

  // Sự kiện rời sách
  if (outOfBookPly !== null && outOfBookPly <= totalPlies) {
    allEvents.push({
      ply: outOfBookPly,
      kind: "roiSach",
      description: `Nước ${state.moves[outOfBookPly - 1]?.notation ?? ""}: Hai bên rời khỏi lý thuyết khai cuộc chuẩn.`,
    });
  }

  // Sự kiện bước vào tàn cuộc lý thuyết
  if (endgameTheoryName !== null && endgameStartPly !== null) {
    allEvents.push({
      ply: endgameStartPly,
      kind: "vaoTanCuocLyThuyet",
      description: `Bước vào định thức tàn cuộc lý thuyết: ${endgameTheoryName}.`,
    });
  }

  // Quét các nước đi để tìm sự kiện đổi quân, mất quân, và bước ngoặt
  for (let i = 0; i < totalPlies; i++) {
    const ply = i + 1;
    const m = state.moves[i];
    const beforeBoard = state.history[i].board;
    const afterBoard = state.history[i + 1].board;

    // Kiểm tra đổi quân có chủ đích
    if (m.captured) {
      const ex = detectExchange(beforeBoard, m.move, afterBoard);
      if (ex) {
        allEvents.push({
          ply,
          kind: "doiQuan",
          description: `Nước ${m.notation}: ${ex.summary}`,
        });
      } else {
        // Kiểm tra mất quân lớn đơn phương
        const capturedVal = PIECE_VALUES[typeOf(m.captured)] ?? 0;
        if (capturedVal >= 400) {
          allEvents.push({
            ply,
            kind: "matQuan",
            description: `Nước ${m.notation}: Mất quân lớn trên bàn cờ.`,
          });
        }
      }
    }

    // Kiểm tra bước ngoặt biến động xác suất thắng
    const wBefore = getWinChanceAtPly(i, options);
    const wAfter = getWinChanceAtPly(ply, options);
    const drop = Math.abs(wAfter - wBefore);
    if (drop >= 0.18) {
      allEvents.push({
        ply,
        kind: "buocNgoat",
        description: `Nước ${m.notation}: Bước ngoặt lớn làm đảo chiều cục diện ván đấu.`,
      });
    }
  }

  // 3. XÂY DỰNG CÁC PHASES LIÊN KẾT
  const phases: PhaseSummary[] = [];

  const createPhase = (
    phase: GamePhase,
    fromPly: number,
    toPly: number,
  ): PhaseSummary => {
    const winStart = getWinChanceAtPly(fromPly, options);
    const winEnd = getWinChanceAtPly(toPly, options);

    // Kế hoạch đại diện cho từng bên trong giai đoạn
    const planR = getMajorityPlan(smoothedPlansR, fromPly, toPly, phase === "tanCuoc" ? "tanCuoc" : "canBang");
    const planB = getMajorityPlan(smoothedPlansB, fromPly, toPly, phase === "tanCuoc" ? "tanCuoc" : "canBang");

    // Đánh giá bên nắm quyền chủ động (initiative)
    const avgWin = (winStart + winEnd) / 2;
    let initiative: Side | null = null;
    if (avgWin >= 0.58) initiative = "r";
    else if (avgWin <= 0.42) initiative = "b";

    // Lọc sự kiện thuộc phạm vi giai đoạn
    const events = allEvents
      .filter((e) => e.ply > fromPly && e.ply <= toPly)
      .sort((a, b) => a.ply - b.ply);

    return {
      phase,
      fromPly,
      toPly,
      plan: { r: planR, b: planB },
      winStart,
      winEnd,
      initiative,
      events,
    };
  };

  // Trường hợp ván cờ rất ngắn (<= endOpeningPly)
  if (totalPlies <= endOpeningPly) {
    phases.push(createPhase("khaiCuoc", 0, totalPlies));
    return phases;
  }

  // Giai đoạn 1: Khai cuộc
  phases.push(createPhase("khaiCuoc", 0, endOpeningPly));

  // Giai đoạn 2: Trung cuộc (nếu có khoảng giữa Khai cuộc và Tàn cuộc)
  if (endOpeningPly < startEndgame) {
    phases.push(createPhase("trungCuoc", endOpeningPly, startEndgame));
  }

  // Giai đoạn 3: Tàn cuộc (nếu có nước đi trong giai đoạn tàn cuộc)
  if (hasEndgame && startEndgame < totalPlies) {
    phases.push(createPhase("tanCuoc", startEndgame, totalPlies));
  }

  return phases;
}

/**
 * Tra cứu giai đoạn ván cờ tại một nửa nước (`ply`) cụ thể.
 */
export function getPhaseAtPly(phases: PhaseSummary[], ply: number): GamePhase {
  for (const ph of phases) {
    if (ply >= ph.fromPly && ply <= ph.toPly) {
      return ph.phase;
    }
  }
  return phases[phases.length - 1]?.phase ?? "trungCuoc";
}
