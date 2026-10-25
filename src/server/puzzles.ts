// Cờ thế phía máy chủ: kiểm tra lời giải, lưu tiến độ, thưởng xu lần giải đầu, tính phí gợi ý.

import { and, eq, sql } from "drizzle-orm";
import { parseFen, type Move } from "@/lib/xiangqi/engine";
import { verifyLineSolution, verifySolution } from "@/lib/xiangqi/mate";
import { FREE_HINT_CHAPTER, findPuzzle } from "@/lib/xiangqi/puzzles";
import type { Database } from "./db";
import { coinTransactions, puzzleProgress, users } from "./db/schema";
import { addCoinsTx, CoinError } from "./economy";

/** Thưởng xu lần giải đầu: 20 xu cho mỗi nước của bên giải. */
export const puzzleReward = (depth: number) => 20 * depth;
export const HINT_COST = 10;

export const starsFor = (attempts: number, hinted: boolean) => (attempts <= 1 && !hinted ? 3 : attempts <= 3 ? 2 : 1);

async function isVip(db: Database, userId: string, now: number) {
  const [u] = await db.select({ vipUntil: users.vipUntil }).from(users).where(eq(users.id, userId));
  return !!u?.vipUntil && u.vipUntil.getTime() > now;
}

async function hintBought(db: Database, userId: string, puzzleId: string) {
  const [row] = await db
    .select({ id: coinTransactions.id })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, "hint"), eq(coinTransactions.ref, puzzleId)));
  return !!row;
}

export type SubmitResult =
  | { ok: true; stars: number; reward: number; firstSolve: boolean }
  | { ok: false; error: string };

/**
 * Ghi nhận một lần giải. `moves` là cả chuỗi nước (Đỏ, Đen, Đỏ…); máy chủ tự kiểm tra lại từ đầu.
 * `attempts` là số lần thử (do trình duyệt đếm), chỉ dùng để chấm sao.
 */
export async function submitPuzzle(
  db: Database, userId: string, puzzleId: string, moves: Move[], attempts: number, now = Date.now(),
): Promise<SubmitResult> {
  const puzzle = findPuzzle(puzzleId);
  if (!puzzle) return { ok: false, error: "Thế cờ không tồn tại." };
  if (puzzle.vip && !(await isVip(db, userId, now))) return { ok: false, error: "Chương này dành cho thành viên VIP." };
  const start = parseFen(puzzle.fen);
  const valid = puzzle.line ? verifyLineSolution(start, moves, puzzle.line) : verifySolution(start, moves, puzzle.depth);
  if (!valid) return { ok: false, error: "Lời giải không đúng." };

  const hinted = puzzle.chapter !== FREE_HINT_CHAPTER && (await hintBought(db, userId, puzzleId));
  const stars = starsFor(Math.max(1, Math.trunc(attempts) || 1), hinted);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(puzzleProgress)
      .values({ userId, puzzleId, stars, attempts: Math.max(1, Math.trunc(attempts) || 1), solvedAt: new Date(now) })
      .onConflictDoUpdate({
        target: [puzzleProgress.userId, puzzleProgress.puzzleId],
        // Giải lại không làm giảm sao; ngày giải giữ nguyên lần đầu (nhiệm vụ "giải 1 thế" không tính giải lại).
        set: { stars: sql`greatest(${puzzleProgress.stars}, excluded.stars)` },
      })
      .returning({ firstSolve: sql<boolean>`(xmax = 0)` });
    const firstSolve = !!inserted[0]?.firstSolve;
    const reward = firstSolve ? puzzleReward(puzzle.depth) : 0;
    if (reward) await addCoinsTx(tx, userId, reward, "puzzle", puzzleId);
    return { ok: true as const, stars, reward, firstSolve };
  });
}

/** Mua gợi ý: 10 xu, chỉ trừ một lần cho mỗi thế. Chương hướng dẫn được gợi ý miễn phí. */
export async function buyHint(
  db: Database, userId: string, puzzleId: string, now = Date.now(),
): Promise<{ ok: true; charged: number; hint: string; from: number } | { ok: false; error: string }> {
  const puzzle = findPuzzle(puzzleId);
  if (!puzzle) return { ok: false, error: "Thế cờ không tồn tại." };
  if (puzzle.vip && !(await isVip(db, userId, now))) return { ok: false, error: "Chương này dành cho thành viên VIP." };
  const give = (charged: number) => ({ ok: true as const, charged, hint: puzzle.hint, from: puzzle.solution.from });
  if (puzzle.chapter === FREE_HINT_CHAPTER || (await hintBought(db, userId, puzzleId))) return give(0);
  try {
    await db.transaction((tx) => addCoinsTx(tx, userId, -HINT_COST, "hint", puzzleId));
    return give(HINT_COST);
  } catch (err) {
    if (err instanceof CoinError) return { ok: false, error: `Cần ${HINT_COST} xu để xem gợi ý.` };
    // Bấm hai lần cùng lúc: lần sau đụng chỉ mục duy nhất, coi như đã mua.
    if (await hintBought(db, userId, puzzleId)) return give(0);
    throw err;
  }
}

/** Tiến độ của người chơi: số sao từng thế đã giải và các thế đã mua gợi ý. */
export async function puzzleState(db: Database, userId: string) {
  const [solved, hints] = await Promise.all([
    db.select({ id: puzzleProgress.puzzleId, stars: puzzleProgress.stars }).from(puzzleProgress).where(eq(puzzleProgress.userId, userId)),
    db
      .select({ ref: coinTransactions.ref })
      .from(coinTransactions)
      .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, "hint"))),
  ]);
  return {
    stars: Object.fromEntries(solved.map((s) => [s.id, s.stars])) as Record<string, number>,
    hints: hints.map((h) => h.ref!).filter(Boolean),
  };
}
