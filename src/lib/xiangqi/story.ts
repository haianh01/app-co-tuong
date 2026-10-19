// Diễn biến ván: tầng "chọn ý" theo ngữ cảnh cả ván, nằm giữa dữ kiện từng nước (explain/intent)
// và lời bình hiển thị. Thay vì bình mọi nước như nhau, chỉ ghi lại những thời điểm đáng kể:
// chuyển giai đoạn, đổi kế hoạch, sai lầm bị trừng phạt hay bị bỏ qua, cán cân đổi chiều,
// cùng các sự kiện giai đoạn đã có (rời sách, đổi quân, mất quân, định thức tàn cuộc).
// Hàm thuần, chỉ đọc kết quả reviewGame, không gọi engine.

import { CLASS_NAME, type MoveClass, type MoveReview, type ReviewResult } from "./analysis";
import { opponent, type Side } from "./engine";
import type { GameState } from "./game";
import { planSeries, type GamePhase, type PhaseEventKind } from "./phases";
import { type PlanThread } from "./plan-thread";
import type { Plan } from "./strategy";

export type StoryKind = "opening" | "phase" | "planShift" | "punished" | "unpunished" | "swing" | "planThread" | PhaseEventKind;

export interface StoryNote {
  /** Nửa nước gắn với ghi chú (giống MoveReview.ply). */
  ply: number;
  kind: StoryKind;
  /** Bên được nói tới, nếu có. */
  side?: Side;
  text: string;
  thread?: PlanThread;
}

const SIDE: Record<Side, string> = { r: "Đỏ", b: "Đen" };
const PHASE_TEXT: Record<GamePhase, string> = { khaiCuoc: "khai cuộc", trungCuoc: "trung cuộc", tanCuoc: "tàn cuộc" };
const FAULTS: MoveClass[] = ["blunder", "mistake", "missedWin"];

/**
 * Câu cho việc đổi kế hoạch `from` → `to` của bên `s` (đối phương `o`); null = không đáng nhắc
 * (về ra quân, hay vào tàn cuộc đã có ghi chú giai đoạn).
 */
function planShiftText(from: Plan, to: Plan, s: string, o: string): string | null {
  switch (to) {
    case "tanCong":
      return `${s} chuyển sang tấn công: đã có quân qua sông áp sát cung ${o}.`;
    case "phongThu":
      return `${s} phải lui về phòng thủ vì cung đang bị quân ${o} uy hiếp.`;
    case "donGianHoa":
      return `${s} đang hơn quân, chuyển sang đổi quân, đơn giản hóa để giữ thành quả.`;
    case "canBang":
      if (from === "raQuan") return `${s} đã ra quân xong, chuyển sang tranh vị trí, tăng hoạt động quân.`;
      if (from === "tanCong") return `Đợt tấn công của ${s} tạm lắng, ${s} quay về củng cố thế trận.`;
      if (from === "phongThu") return `${s} đã hóa giải được sức ép, thế cờ trở lại cân bằng.`;
      return `${s} quay về củng cố, tăng hoạt động quân.`;
    default:
      return null;
  }
}

/** Xác suất thắng của Đỏ sau nước `m` (winAfter tính theo bên đi). */
function redWin(m: MoveReview): number | undefined {
  if (m.winAfter === undefined) return undefined;
  return m.side === "r" ? m.winAfter : 1 - m.winAfter;
}

/** Diễn đạt cán cân từ xác suất thắng của Đỏ. */
export function balanceText(w: number): string {
  const lead: Side = w >= 0.5 ? "r" : "b";
  const p = lead === "r" ? w : 1 - w;
  if (p >= 0.85) return `${SIDE[lead]} ưu thế lớn`;
  if (p >= 0.65) return `${SIDE[lead]} chiếm ưu`;
  if (p >= 0.55) return `${SIDE[lead]} hơi ưu`;
  return "hai bên cân bằng";
}

const sameMove = (a?: { from: number; to: number } | null, b?: { from: number; to: number } | null) =>
  !!a && !!b && a.from === b.from && a.to === b.to;
const moveNo = (ply: number) => Math.ceil(ply / 2);

/** Viết hoa chữ cái đầu câu (tên bên có thể là "bạn", "máy"). */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Sai lầm có bị trừng phạt không: so nước đáp AI tính (`replyMove`) với nước đối phương thật sự đi.
 * Ghi chú gắn vào nửa nước của bên đáp. `names` đổi cách gọi hai bên (vd. "bạn" / "máy" khi đang chơi).
 */
export function punishmentNotes(moves: MoveReview[], names: Record<Side, string> = SIDE): StoryNote[] {
  const notes: StoryNote[] = [];
  for (let k = 0; k + 1 < moves.length; k++) {
    const m = moves[k];
    const next = moves[k + 1];
    if (next.ply !== m.ply + 1 || !m.cls || !FAULTS.includes(m.cls) || !m.replyMove) continue;
    const s = names[m.side];
    const o = names[opponent(m.side)];
    if (sameMove(m.replyMove, next.move)) {
      notes.push({
        ply: next.ply,
        kind: "punished",
        side: next.side,
        text: cap(`${o} trừng phạt ngay sai lầm ${m.notation} của ${s} (nước ${moveNo(m.ply)}) bằng ${next.notation}.`),
      });
    } else if (next.cls && [...FAULTS, "inaccuracy"].includes(next.cls)) {
      const reply = m.line?.[0];
      notes.push({
        ply: next.ply,
        kind: "unpunished",
        side: next.side,
        text: cap(
          reply
            ? `${o} bỏ lỡ cơ hội trừng phạt ${m.notation}: nước mạnh là ${reply}, nhưng ${o} lại đi ${next.notation}.`
            : `${o} chưa tận dụng được sai lầm ${m.notation} của ${s}.`,
        ),
      });
    }
  }
  return notes;
}

export function buildStory(review: ReviewResult, state: GameState): StoryNote[] {
  const moves = review.moves;
  const notes: StoryNote[] = [];

  // 0. Thế trận khai cuộc và ý đồ điển hình của mỗi bên, gắn ở nước cuối còn khớp sách
  const guide = review.openingGuide;
  if (guide?.line && guide.intent && guide.pliesMatched > 0) {
    notes.push({
      ply: Math.min(guide.pliesMatched, moves.length),
      kind: "opening",
      text: `Thế trận ${guide.name}. Ý đồ điển hình — Đỏ: ${guide.intent.r}; Đen: ${guide.intent.b}.`,
    });
  }

  // 1. Chuyển giai đoạn, kèm cán cân lúc đó
  for (let k = 1; k < moves.length; k++) {
    const prev = moves[k - 1].phase;
    const cur = moves[k].phase;
    if (!prev || !cur || prev === cur) continue;
    const w = redWin(moves[k]);
    const tail = w === undefined ? "" : ` Lúc này ${balanceText(w)}.`;
    notes.push({ ply: moves[k].ply, kind: "phase", text: `Ván cờ bước vào ${PHASE_TEXT[cur]}.${tail}` });
  }

  // 2. Đổi kế hoạch: theo chuỗi kế hoạch đã làm mượt, chỉ nhắc khi kế hoạch mới giữ được ít nhất 2 nước
  // Hai bên cùng ra quân xong (cùng đổi kế hoạch từ ra quân trong vòng 2 nửa nước) thì gộp thành một câu.
  const plans = planSeries(state);
  const shifts: { ply: number; side: Side; from: Plan; to: Plan }[] = [];
  for (const s of ["r", "b"] as Side[]) {
    const series = plans[s];
    let stable = series[0];
    for (let i = 1; i < series.length; i++) {
      const cand = series[i];
      if (cand === stable) continue;
      if (series.slice(i, i + 4).some((p) => p !== cand)) continue;
      shifts.push({ ply: i, side: s, from: stable, to: cand });
      stable = cand;
    }
  }
  shifts.sort((a, b) => a.ply - b.ply);
  const merged = new Set<number>();
  shifts.forEach((x, idx) => {
    if (merged.has(idx)) return;
    const pair = shifts.findIndex((y, j) => j > idx && !merged.has(j) && x.from === "raQuan" && y.side !== x.side && y.to === x.to && y.from === x.from && y.ply - x.ply <= 2);
    if (pair >= 0) {
      merged.add(pair);
      const text = planShiftText(x.from, x.to, "Hai bên", "đối phương");
      if (text) notes.push({ ply: x.ply, kind: "planShift", text: text.replace("Hai bên đã", "Hai bên đều đã") });
      return;
    }
    const text = planShiftText(x.from, x.to, SIDE[x.side], SIDE[opponent(x.side)]);
    if (text) notes.push({ ply: x.ply, kind: "planShift", side: x.side, text });
  });

  // 3. Sai lầm có bị trừng phạt không
  notes.push(...punishmentNotes(moves));

  // 4. Cán cân đổi chiều: bên dẫn trước rõ (≥ 60%) mất lợi thế về tay đối phương
  let lastW = 0.5;
  for (const m of moves) {
    const w = redWin(m);
    if (w === undefined) continue;
    if ((lastW >= 0.6 && w <= 0.4) || (lastW <= 0.4 && w >= 0.6)) {
      notes.push({
        ply: m.ply,
        kind: "swing",
        side: m.side,
        text: `Cán cân đổi chiều sau ${SIDE[m.side]} ${m.notation}: từ ${balanceText(lastW)} thành ${balanceText(w)}.`,
      });
    }
    lastW = w;
  }

  // 5. Sự kiện giai đoạn sẵn có (bỏ "bước ngoặt" vì mục 4 đã nói rõ hơn)
  for (const ph of review.phases ?? []) {
    for (const e of ph.events) {
      if (e.kind === "buocNgoat") continue;
      notes.push({ ply: e.ply, kind: e.kind, text: e.description });
    }
  }

  // 6. Mạch kế hoạch (PlanThread): chọn tối đa 3 mạch tiêu biểu nhất theo độ quan trọng
  const threadScore = (t: PlanThread): number => {
    let score = 0;
    if (t.outcome === "thanhCong") score += 100;
    else if (t.outcome === "doiQuan") score += 60;
    else if (t.outcome === "biHoaGiai") score += 40;
    else score += 10;
    if (t.strikeMove) score += 40; // Có đòn dứt điểm cụ thể
    if (t.target.kind !== "cungTuong") score += 20; // Mục tiêu cụ thể, độ tin cậy cao
    const distinctPieces = new Set(t.route.map((r) => r.pieceId ?? r.move.from)).size;
    if (distinctPieces >= 2) score += 20; // Đa quân phối hợp
    score += Math.min(t.route.length * 5, 25);
    return score;
  };

  const notableThreads = [...(review.planThreads ?? [])]
    .filter((t) => t.outcome !== "boDo" || t.route.length >= 3)
    .sort((a, b) => threadScore(b) - threadScore(a))
    .slice(0, 3)
    .sort((a, b) => a.startPly - b.startPly);

  for (const t of notableThreads) {
    notes.push({
      ply: t.endPly,
      kind: "planThread",
      side: t.side,
      text: t.summary,
      thread: t,
    });
  }

  const order: StoryKind[] = ["punished", "unpunished", "swing", "opening", "phase", "planShift", "planThread"];
  const rank = (k: StoryKind) => (order.includes(k) ? order.indexOf(k) : order.length);
  return notes.sort((a, b) => a.ply - b.ply || rank(a.kind) - rank(b.kind));
}

/**
 * Tóm tắt cả ván trong 2–3 câu: cán cân tới trung cuộc, thời điểm quyết định (sai lầm lớn nhất,
 * gộp các sai lầm sát nhau thành một chuỗi), rồi kết cục và độ chính xác.
 */
export function summarizeGame(review: ReviewResult, state: GameState): string {
  const moves = review.moves;
  if (moves.length === 0) return "";
  const out: string[] = [];
  const intro = review.openingGuide?.line ? `Thế trận ${review.openingGuide.name}` : "Ván cờ";

  // 1. Cán cân lúc vào trung cuộc (hoặc giữa ván nếu không có ranh giới giai đoạn)
  const midIdx = moves.findIndex((m) => m.phase === "trungCuoc");
  const mid = moves[midIdx >= 0 ? midIdx : Math.floor(moves.length / 2)];
  const wMid = redWin(mid);
  if (wMid !== undefined) {
    const bal = balanceText(wMid);
    out.push(bal === "hai bên cân bằng" ? `${intro}: hai bên cân bằng tới trung cuộc.` : `${intro}: ${bal} khi vào trung cuộc.`);
  }

  // 2. Thời điểm quyết định: sai lầm làm tụt nhiều % thắng nhất; các sai lầm cách nhau ≤ 3 nửa nước gộp thành chuỗi
  const faults = moves.filter((m) => m.cls && [...FAULTS, "inaccuracy"].includes(m.cls));
  const worst = faults.reduce<MoveReview | null>((w, m) => ((m.winDrop ?? 0) > (w?.winDrop ?? 0) ? m : w), null);
  if (worst && (worst.winDrop ?? 0) >= 0.1) {
    let lo = worst.ply;
    let hi = worst.ply;
    for (let grown = true; grown; ) {
      grown = false;
      for (const f of faults) {
        if (f.ply < lo && lo - f.ply <= 3) (lo = f.ply), (grown = true);
        if (f.ply > hi && f.ply - hi <= 3) (hi = f.ply), (grown = true);
      }
    }
    const beneficiary = SIDE[opponent(worst.side)];
    out.push(
      lo === hi
        ? `Thời điểm quyết định là ${SIDE[worst.side]} ${worst.notation} ở nước ${moveNo(worst.ply)} (${CLASS_NAME[worst.cls!].toLowerCase()}), đẩy thế cờ về phía ${beneficiary}.`
        : `Chuỗi sai lầm ở nước ${moveNo(lo)}–${moveNo(hi)} quyết định thế trận, nặng nhất là ${SIDE[worst.side]} ${worst.notation}, có lợi cho ${beneficiary}.`,
    );
  } else {
    out.push("Không có sai lầm lớn, thế cờ chuyển biến từ từ.");
  }

  // 3. Kết cục và độ chính xác
  const end = state.result
    ? state.result.winner
      ? `${SIDE[state.result.winner]} thắng.`
      : "Ván cờ hòa."
    : (() => {
        const w = redWin(moves[moves.length - 1]);
        return w === undefined ? "" : `Thế cờ dừng ở: ${balanceText(w)}.`;
      })();
  const acc = review.accuracy;
  const accText = acc.r !== null && acc.b !== null ? ` Độ chính xác: Đỏ ${acc.r}%, Đen ${acc.b}%.` : "";
  if (end || accText) out.push((end + accText).trim());

  return out.join(" ");
}
