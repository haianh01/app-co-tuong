// Mạch kế hoạch (PlanThread): Theo dõi các chuỗi nước đi có cùng mục tiêu chiến lược
// xuyên suốt nhiều nước đi của ván cờ, từ lúc mở màn kế hoạch, bố trí lực lượng (route),
// tới kết cục (thành công / đổi quân / bị hóa giải / bỏ dở).
// Thuần hàm, tất định, fail-closed, bám theo danh tính quân cờ (pieceId).

import {
  type Board,
  type Move,
  type PieceType,
  type Side,
  attackersOf,
  crossedRiver,
  hasAnyLegalMove,
  inCheck,
  inPalaceSq,
  isDefended,
  opponent,
  pseudoMoves,
  rowOf,
  sideOf,
  typeOf,
} from "./engine";
import { exchangeGain } from "./explain";
import { extractFeatures } from "./features";
import { type PositionEval } from "./analysis";
import { type PlayedMove } from "./game";
import { PIECE_NAME, SIDE_NAME } from "./notation";
import { fileOf } from "./opening-shapes";
import { attackPressure, palacePressure } from "./strategy";

export type WeaknessKind =
  | "quanBiKim"      // Quân bị kìm, cản chân, kẹt đường
  | "quanTreo"       // Quân lẻ loi không căn, mất gốc
  | "tuongCanMat"    // Tượng bị cản mắt đang bị đe dọa
  | "cungTuong";     // Sức ép dồn vào cung Tướng

export interface WeaknessTarget {
  id: string;
  kind: WeaknessKind;
  side: Side;              // Phe sở hữu điểm yếu (bị nhắm tới)
  pieceId?: number;        // ID gốc cố định của quân cờ (từ pieceIds)
  square: number;          // Vị trí hiện tại của quân/mục tiêu
  pieceType: PieceType;
  description: string;
}

export type ThreadRole =
  | "apSat"          // Tiếp cận: 1-hop có thể đánh tới ô mục tiêu ở nước sau
  | "tangApLuc"      // Tăng áp lực: tăng số quân kiểm soát mục tiêu hoặc dồn cung
  | "taoNgoi"        // Làm ngòi cho Pháo công vào mục tiêu
  | "danhDich";      // Đòn công phạt ăn quân mục tiêu hoặc đột phá cung

export interface ThreadRouteStep {
  ply: number;
  side: Side;
  move: Move;
  notation: string;
  role: ThreadRole;
  piece: PieceType;
  pieceId?: number;
}

export type ThreadOutcome =
  | "thanhCong"  // Ăn được quân mục tiêu có lời (gain >= 100) hoặc công phá sập cung
  | "doiQuan"    // Đổi quân ngang giá / đơn giản hóa thế trận (-50 <= gain < 100)
  | "biHoaGiai"  // Đối phương kịp thời phòng thủ an toàn
  | "boDo"       // Bên công chuyển hướng sau khi đã duy trì áp lực
  | "dangDo";    // Ván đấu kết thúc khi kế hoạch chưa ngã ngũ

export interface PlanThread {
  id: string;
  side: Side;                 // Bên thực hiện kế hoạch
  target: WeaknessTarget;     // Điểm yếu nhắm tới
  startPly: number;           // Nửa nước bắt đầu (1-indexed)
  endPly: number;             // Nửa nước kết thúc
  route: ThreadRouteStep[];   // Các nước đi tạo nên mạch kế hoạch
  outcome: ThreadOutcome;
  strikeMove?: { ply: number; notation: string };
  defenderMove?: { ply: number; notation: string };
  summary: string;
}

/** Trần điểm eval (cp), giống CAP trong analysis.ts. */
const EVAL_CAP = 1500;

const moveNo = (ply: number) => Math.max(1, Math.ceil(ply / 2));

const HOME_ROOK_SQUARES = new Set([0, 8, 81, 89]);

/**
 * Trích xuất danh sách các điểm yếu thực sự của bên `side` trên bàn cờ.
 * Một quân chỉ tạo tối đa 1 điểm yếu (dùng pieceId làm khóa nhận diện).
 */
export function extractWeaknesses(
  board: Board,
  side: Side,
  pieceIdMap?: (number | null)[],
  ply = 20,
): WeaknessTarget[] {
  const targets: WeaknessTarget[] = [];
  const features = extractFeatures(board)[side];
  const opp = opponent(side);

  for (const p of features.pieces) {
    const sq = p.ref.square;
    const piece = board[sq];
    if (!piece) continue;
    const t = typeOf(piece);

    // Không tính Xe đứng yên ở góc nhà trong giai đoạn đầu là bị kìm
    if (t === "r" && HOME_ROOK_SQUARES.has(sq) && ply <= 12) continue;

    const pId = pieceIdMap ? pieceIdMap[sq] ?? undefined : undefined;
    const descFile = fileOf(sq, side);
    const targetId = pId !== undefined ? `${side}-p-${pId}` : `${side}-${sq}`;

    if (p.tags.includes("maChet") || (p.tags.includes("xeBiKim") && !HOME_ROOK_SQUARES.has(sq))) {
      targets.push({
        id: targetId,
        kind: "quanBiKim",
        side,
        pieceId: pId,
        square: sq,
        pieceType: t,
        description: `${PIECE_NAME[t]} ${descFile} bị kìm kẹp`,
      });
    } else if (p.tags.includes("maBiCanChan") && p.safeMoves <= 1) {
      targets.push({
        id: targetId,
        kind: "quanBiKim",
        side,
        pieceId: pId,
        square: sq,
        pieceType: t,
        description: `Mã ${descFile} bị cản chân`,
      });
    } else if (
      (p.tags.includes("treo") || p.tags.includes("matGoc")) &&
      (t === "r" || t === "c" || t === "n")
    ) {
      if (attackersOf(board, sq, opp).length > 0) {
        targets.push({
          id: targetId,
          kind: "quanTreo",
          side,
          pieceId: pId,
          square: sq,
          pieceType: t,
          description: `${PIECE_NAME[t]} ${descFile} không có căn giữ`,
        });
      }
    } else if (p.tags.includes("tuongBiCanMat") && t === "b") {
      if (attackPressure(board, side) >= 1 || attackersOf(board, sq, opp).length > 0) {
        targets.push({
          id: targetId,
          kind: "tuongCanMat",
          side,
          pieceId: pId,
          square: sq,
          pieceType: t,
          description: `Tượng ${descFile} bị cản mắt`,
        });
      }
    }
  }

  // Cung Tướng: áp lực khi đối phương có quân qua sông kiểm soát cung (ngưỡng siết chặt)
  const aPressure = attackPressure(board, side);
  const pPressure = palacePressure(board, side);
  if (aPressure >= 2 && pPressure >= 3) {
    const kSq = board.findIndex((x) => x && sideOf(x) === side && typeOf(x) === "k");
    if (kSq >= 0) {
      const kId = pieceIdMap ? pieceIdMap[kSq] ?? undefined : undefined;
      targets.push({
        id: `${side}-palace`,
        kind: "cungTuong",
        side,
        pieceId: kId,
        square: kSq,
        pieceType: "k",
        description: `cung Tướng ${SIDE_NAME[side]}`,
      });
    }
  }

  return targets;
}

/**
 * Đánh giá xem nước đi `move` của bên `attacker` có đóng góp thực chất vào mục tiêu `target` không.
 */
function evaluateMoveRole(
  before: Board,
  move: Move,
  after: Board,
  target: WeaknessTarget,
  attacker: Side,
  beforePieceIds?: (number | null)[],
): ThreadRole | null {
  const movingPiece = before[move.from];
  if (!movingPiece || sideOf(movingPiece) !== attacker) return null;
  const pType = typeOf(movingPiece);

  // 1. Mục tiêu Cung Tướng (cungTuong)
  if (target.kind === "cungTuong") {
    // Chiếu bí thật sự (chuẩn engine fail-closed: đang bị chiếu và không còn bất kỳ nước đi hợp lệ nào)
    if (inCheck(after, target.side) && !hasAnyLegalMove({ board: after, turn: target.side })) {
      return "danhDich";
    }

    // Ăn Sĩ hoặc Tượng phòng thủ cung CÓ LỜI (gain >= 100)
    const victim = before[move.to];
    if (victim && sideOf(victim) !== attacker && (typeOf(victim) === "a" || typeOf(victim) === "b")) {
      const gain = exchangeGain(before, move.to, attacker);
      if (gain !== null && gain >= 100) {
        return "danhDich";
      }
    }

    // Tăng sức ép cung tướng: áp lực tăng lên, hoặc quân xâm nhập trực tiếp vào cung
    const oldPalace = palacePressure(before, target.side);
    const newPalace = palacePressure(after, target.side);
    if (newPalace > oldPalace || (!inPalaceSq(move.from, target.side) && inPalaceSq(move.to, target.side))) {
      return "tangApLuc";
    }
    // Chiếu tướng chỉ tính tăng áp lực nếu vẫn duy trì sức ép cung mạnh
    if (inCheck(after, target.side) && newPalace >= 2 && newPalace >= oldPalace) {
      return "tangApLuc";
    }

    // Quân áp sát khu vực cung: đã qua sông và có thể đánh trực tiếp vào cung ở nước sau
    if (
      crossedRiver(rowOf(move.to), attacker) &&
      (pType === "r" || pType === "c" || pType === "n" || pType === "p")
    ) {
      const reachables = pseudoMoves(after, move.to);
      if (reachables.some((sq) => inPalaceSq(sq, target.side))) {
        return "apSat";
      }
    }
    return null;
  }

  // 2. Mục tiêu là quân cụ thể (quanTreo, quanBiKim, tuongCanMat)
  if (move.to === target.square) {
    if (target.pieceId !== undefined && beforePieceIds) {
      if (beforePieceIds[move.to] !== target.pieceId) return null;
    }
    const victim = before[target.square];
    if (victim && sideOf(victim) !== attacker) {
      const gain = exchangeGain(before, target.square, attacker);
      if (gain !== null && gain >= -50) {
        return "danhDich";
      }
    }
    return null;
  }

  // Tăng quân đe dọa (tangApLuc) hoặc tạo ngòi (taoNgoi)
  const oldAttackers = attackersOf(before, target.square, attacker);
  const newAttackers = attackersOf(after, target.square, attacker);

  if (newAttackers.length > oldAttackers.length) {
    if (pType !== "c" && newAttackers.some((atk) => typeOf(after[atk]!) === "c")) {
      return "taoNgoi";
    }
    return "tangApLuc";
  }

  // Tiếp cận (apSat): 1-hop away
  if (pType === "n" || pType === "r" || pType === "c" || pType === "p") {
    const reachable = pseudoMoves(after, move.to);
    if (reachable.includes(target.square)) {
      return "apSat";
    }
  }

  return null;
}

/**
 * Kiểm tra xem nước đi của bên phòng thủ có giải tỏa được mục tiêu hay không.
 */
function isTargetDefendedOrSaved(
  before: Board,
  move: Move,
  after: Board,
  target: WeaknessTarget,
  beforePieceIds?: (number | null)[],
): boolean {
  const opp = opponent(target.side);

  // Nếu mục tiêu là cung tướng
  if (target.kind === "cungTuong") {
    const oldPalace = palacePressure(before, target.side);
    const newPalace = palacePressure(after, target.side);
    const pType = before[move.from] ? typeOf(before[move.from]!) : null;

    // 1. Sĩ hoặc Tượng về củng cố làm giảm trực tiếp áp lực cung
    if ((pType === "a" || pType === "b") && newPalace < oldPalace) {
      return true;
    }
    // 2. Nước phòng thủ trực tiếp làm tan rã áp lực (giảm áp lực xuống <= 1)
    if (newPalace < oldPalace && newPalace <= 1) {
      return true;
    }
    return false;
  }

  // Trường hợp 1: Quân mục tiêu tự di chuyển thoát chạy
  if (
    (target.pieceId !== undefined && beforePieceIds && beforePieceIds[move.from] === target.pieceId) ||
    move.from === target.square
  ) {
    const atksAfter = attackersOf(after, move.to, opp);
    // Chạy tới ô an toàn hoàn toàn hoặc có căn giữ an toàn
    if (atksAfter.length === 0) return true;
    if (isDefended(after, move.to, target.side)) {
      const gain = exchangeGain(after, move.to, opp);
      if (gain === null || gain <= 0) return true;
    }
    // Chạy vào ô vẫn bị ăn có lời -> không tính là hóa giải
    return false;
  }

  // Trường hợp 2: Thêm quân giữ vững ô mục tiêu đang bị đe dọa
  const oldDefended = isDefended(before, target.square, target.side);
  const newDefended = isDefended(after, target.square, target.side);
  const oldAtks = attackersOf(before, target.square, opp);
  const newAtks = attackersOf(after, target.square, opp);

  if (oldAtks.length > 0 && !oldDefended && newDefended) {
    const gain = exchangeGain(after, target.square, opp);
    if (gain === null || gain <= 0) return true;
  }

  // Trường hợp 3: Cản đường / giải tỏa toàn bộ kẻ tấn công
  if (oldAtks.length > 0 && newAtks.length === 0) {
    return true;
  }

  return false;
}

interface ActiveThread {
  id: string;
  side: Side;
  target: WeaknessTarget;
  startPly: number;
  lastActivePly: number;
  route: ThreadRouteStep[];
  idlePlies: number;
  outcome: ThreadOutcome;
  strikeMove?: { ply: number; notation: string };
  defenderMove?: { ply: number; notation: string };
}

/**
 * Tạo câu kể chuyện tự nhiên và chuẩn xác từ một mạch kế hoạch.
 */
export function narratePlanThread(thread: PlanThread): string {
  const sideName = SIDE_NAME[thread.side];
  const oppName = SIDE_NAME[opponent(thread.side)];
  const startMove = moveNo(thread.startPly);
  const endMove = moveNo(thread.endPly);

  const sampleMoves = thread.route
    .slice(0, 3)
    .map((r) => r.notation)
    .join(", ");

  const rangeText =
    startMove === endMove ? `Ở nước ${startMove}` : `Từ nước ${startMove} đến ${endMove}`;

  const targetDesc = thread.target.description;

  if (thread.outcome === "thanhCong") {
    if (thread.target.kind === "cungTuong") {
      let strikeText = " Đợt công kích tạo ưu thế rõ rệt.";
      if (thread.strikeMove) {
        const step = thread.route.find((r) => r.ply === thread.strikeMove?.ply);
        if (step?.role === "danhDich") {
          strikeText = ` Đến nước ${moveNo(thread.strikeMove.ply)}, ${sideName} dứt điểm phòng tuyến bằng ${thread.strikeMove.notation}.`;
        } else {
          strikeText = ` Đợt công kích khép lại ở nước ${moveNo(thread.strikeMove.ply)} bằng ${thread.strikeMove.notation}, tạo ưu thế rõ rệt.`;
        }
      }
      return `${rangeText}, ${sideName} dồn quân (${sampleMoves}) uy hiếp ${targetDesc}.${strikeText}`;
    }
    const strikeText = thread.strikeMove
      ? ` Đến nước ${moveNo(thread.strikeMove.ply)}, ${sideName} hoàn thành ý đồ bằng ${thread.strikeMove.notation}.`
      : "";
    return `${rangeText}, ${sideName} điều quân (${sampleMoves}) nhắm vào ${targetDesc}.${strikeText}`;
  }

  if (thread.outcome === "doiQuan") {
    const strikeText = thread.strikeMove
      ? ` Đến nước ${moveNo(thread.strikeMove.ply)}, ${sideName} tiến hành đổi quân bằng ${thread.strikeMove.notation}.`
      : "";
    return `${rangeText}, ${sideName} dàn quân (${sampleMoves}) ép đổi quân ở ${targetDesc}.${strikeText}`;
  }

  if (thread.outcome === "biHoaGiai") {
    const defText = thread.defenderMove
      ? ` ${oppName} hóa giải kịp thời bằng nước ${thread.defenderMove.notation} ở nước ${moveNo(thread.defenderMove.ply)}.`
      : ` ${oppName} đã kịp thời củng cố phòng thủ.`;
    return `${rangeText}, ${sideName} dàn quân (${sampleMoves}) gây sức ép vào ${targetDesc}.${defText}`;
  }

  if (thread.outcome === "boDo") {
    return `${rangeText}, ${sideName} điều quân (${sampleMoves}) hướng về ${targetDesc}, nhưng sau đó chuyển hướng thế trận.`;
  }

  return `${rangeText}, ${sideName} phối hợp quân (${sampleMoves}) thăm dò ${targetDesc}.`;
}

function evalForSide(
  evals: (PositionEval | null | undefined)[] | undefined,
  ply: number,
  side: Side,
): number | null {
  if (!evals || !evals[ply]) return null;
  const ev = evals[ply]!;
  const turnAtPly: Side = ply % 2 === 0 ? "r" : "b";
  // Kẹp như analysis.ts: điểm chiếu bí (~90000+) không được tự biến chênh lệch eval thành "thành công".
  const score = Math.max(-EVAL_CAP, Math.min(EVAL_CAP, ev.score));
  const scoreRed = turnAtPly === "r" ? score : -score;
  return side === "r" ? scoreRed : -scoreRed;
}

/**
 * Đóng mạch cung Tướng không có đòn dứt điểm: chỉ tính thành công khi eval bên công tăng >= 200cp
 * từ trước nước mở mạch tới nước dồn ép cuối; không có eval thì fail-closed thành bỏ dở.
 */
function settleByEval(t: ActiveThread, evals: (PositionEval | null)[] | undefined): void {
  const startEv = evalForSide(evals, t.startPly - 1, t.side);
  const curEv = evalForSide(evals, t.lastActivePly, t.side);
  if (startEv !== null && curEv !== null && curEv - startEv >= 200) {
    t.outcome = "thanhCong";
    const lastStep = t.route[t.route.length - 1];
    t.strikeMove = { ply: lastStep.ply, notation: lastStep.notation };
  } else {
    t.outcome = "boDo";
  }
}

/** Mạch đã có kết cục → PlanThread, hoặc null nếu chỉ là đòn chiến thuật ngắn / không có sức ép thật. */
function finalizeThread(t: ActiveThread): PlanThread | null {
  const span = t.lastActivePly - t.startPly;
  const distinctPieces = new Set(t.route.map((r) => r.pieceId ?? r.move.from)).size;
  // Loại bỏ đòn chiến thuật 2 nước chớp nhoáng (span <= 3, chỉ dọa-rồi-ăn)
  const isTwoPlyTactic = span <= 3 && t.route.length <= 2;
  const isRealPlan =
    !isTwoPlyTactic &&
    (t.route.length >= 3 || (distinctPieces >= 2 && span >= 4) || (t.target.kind === "cungTuong" && span >= 4));
  if (!isRealPlan) return null;
  const hasRealPressure = t.route.some(
    (r) => r.role === "tangApLuc" || r.role === "taoNgoi" || r.role === "danhDich",
  );
  if (!hasRealPressure) return null;
  const pt: PlanThread = {
    id: t.id,
    side: t.side,
    target: t.target,
    startPly: t.startPly,
    endPly: t.lastActivePly,
    route: t.route,
    outcome: t.outcome,
    strikeMove: t.strikeMove,
    defenderMove: t.defenderMove,
    summary: "",
  };
  pt.summary = narratePlanThread(pt);
  return pt;
}

/**
 * Theo dõi và bóc tách các mạch kế hoạch trong toàn bộ ván cờ.
 * Khởi động sau khai cuộc (ply >= 10), nhận diện kế hoạch đa nước/đa quân.
 */
export function trackPlanThreads(
  moves: PlayedMove[],
  history: Board[],
  evals?: (PositionEval | null)[],
): PlanThread[] {
  if (moves.length < 10 || history.length <= moves.length) return [];

  const completedThreads: PlanThread[] = [];
  let activeThreads: ActiveThread[] = [];
  let nextThreadId = 1;

  const currentPieceIds: (number | null)[] = history[0].map((p, i) => (p ? i : null));

  for (let i = 0; i < moves.length; i++) {
    const ply = i + 1; // 1-indexed
    const played = moves[i];
    const beforeBoard = history[i];
    const afterBoard = history[i + 1];
    const mover = played.side;
    const defender = opponent(mover);

    const beforePieceIds = [...currentPieceIds];
    currentPieceIds[played.move.to] = currentPieceIds[played.move.from];
    currentPieceIds[played.move.from] = null;

    // Cập nhật vị trí hiện tại của các target trong activeThreads
    for (const t of activeThreads) {
      if (t.target.pieceId !== undefined && t.target.kind !== "cungTuong") {
        const curSq = beforePieceIds.indexOf(t.target.pieceId);
        if (curSq >= 0) {
          t.target.square = curSq;
        }
      } else if (t.target.kind === "cungTuong") {
        const curKingSq = beforeBoard.findIndex(
          (x) => x && sideOf(x) === t.target.side && typeOf(x) === "k",
        );
        if (curKingSq >= 0) {
          t.target.square = curKingSq;
        }
      }
    }

    // 1. Kiểm tra xem nước này có giải tỏa mạch nào của đối phương nhắm vào mình không
    for (const thread of activeThreads) {
      if (thread.side === defender && thread.outcome === "dangDo") {
        if (isTargetDefendedOrSaved(beforeBoard, played.move, afterBoard, thread.target, beforePieceIds)) {
          // Kiểm tra chất lượng nước phòng thủ qua engine eval nếu có
          const evalBefore = evalForSide(evals, i, defender);
          const evalAfter = evalForSide(evals, i + 1, defender);
          const isBlunder = evalBefore !== null && evalAfter !== null && evalBefore - evalAfter > 150;

          if (!isBlunder) {
            thread.outcome = "biHoaGiai";
            thread.defenderMove = { ply, notation: played.notation };
            thread.lastActivePly = ply;
          }
        }
      }
    }

    // 2. Kiểm tra xem nước này có đóng góp vào mạch đang mở của bên đi không
    for (const thread of activeThreads) {
      if (thread.side === mover && thread.outcome === "dangDo") {
        const role = evaluateMoveRole(
          beforeBoard,
          played.move,
          afterBoard,
          thread.target,
          mover,
          beforePieceIds,
        );
        if (role) {
          thread.route.push({
            ply,
            side: mover,
            move: played.move,
            notation: played.notation,
            role,
            piece: typeOf(beforeBoard[played.move.from]!),
            pieceId: beforePieceIds[played.move.from] ?? undefined,
          });
          thread.lastActivePly = ply;
          thread.idlePlies = 0;

          if (role === "danhDich") {
            thread.strikeMove = { ply, notation: played.notation };
            if (thread.target.kind === "cungTuong") {
              // Chiếu bí thật hoặc ăn Sĩ/Tượng có lời
              thread.outcome = "thanhCong";
            } else {
              thread.target.square = played.move.to;
              const gain = exchangeGain(beforeBoard, played.move.to, mover);
              if (gain !== null && gain >= 100) {
                thread.outcome = "thanhCong";
              } else {
                thread.outcome = "doiQuan";
              }
            }
          }
        } else {
          thread.idlePlies++;
          if (thread.idlePlies >= 4) {
            if (thread.target.kind === "cungTuong") {
              settleByEval(thread, evals);
            } else {
              thread.outcome = "boDo";
            }
          }
        }
      }
    }

    // 3. Quét mở mạch mới (chỉ mở từ ply 10 trở đi)
    if (ply >= 10) {
      const weaknesses = extractWeaknesses(afterBoard, defender, currentPieceIds, ply);
      for (const target of weaknesses) {
        const exists = activeThreads.some(
          (t) => t.side === mover && t.target.id === target.id && t.outcome === "dangDo",
        );
        if (exists) continue;

        const role = evaluateMoveRole(
          beforeBoard,
          played.move,
          afterBoard,
          target,
          mover,
          beforePieceIds,
        );
        if (role && role !== "danhDich") {
          // Với cung tướng: chỉ mở mạch khi nước đi trực tiếp làm tăng áp lực vào cung
          if (target.kind === "cungTuong" && role !== "tangApLuc") continue;

          activeThreads.push({
            id: `thread-${nextThreadId++}`,
            side: mover,
            target,
            startPly: ply,
            lastActivePly: ply,
            route: [
              {
                ply,
                side: mover,
                move: played.move,
                notation: played.notation,
                role,
                piece: typeOf(beforeBoard[played.move.from]!),
                pieceId: beforePieceIds[played.move.from] ?? undefined,
              },
            ],
            idlePlies: 0,
            outcome: "dangDo",
          });
        }
      }
    }

    // Lọc đóng các mạch đã kết thúc
    const remaining: ActiveThread[] = [];
    for (const t of activeThreads) {
      if (t.outcome === "dangDo") {
        remaining.push(t);
        continue;
      }
      const pt = finalizeThread(t);
      if (pt) completedThreads.push(pt);
    }
    activeThreads = remaining;
  }

  // Thu hồi các mạch dangDo còn sót lại ở cuối ván
  for (const t of activeThreads) {
    if (t.outcome !== "dangDo") continue;
    if (t.target.kind === "cungTuong") settleByEval(t, evals);
    else t.outcome = "boDo";
    const pt = finalizeThread(t);
    if (pt) completedThreads.push(pt);
  }

  // Khử trùng lặp: loại bỏ các mạch cùng route hoặc cùng target trùng lặp thời gian
  completedThreads.sort((a, b) => a.startPly - b.startPly);
  const deduplicated: PlanThread[] = [];
  for (const t of completedThreads) {
    const routeKey = t.route.map((r) => r.ply).join(",");
    const isDup = deduplicated.some(
      (d) =>
        d.route.map((r) => r.ply).join(",") === routeKey ||
        (d.side === t.side && d.target.id === t.target.id && Math.abs(d.startPly - t.startPly) <= 3),
    );
    if (!isDup) {
      deduplicated.push(t);
    }
  }

  return deduplicated;
}
