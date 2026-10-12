"use client";

// Huấn luyện khi đánh với máy: chấm ngay từng nước của người chơi bằng một AI riêng (worker thứ hai,
// không tranh với máy đang đánh). Điểm được nhớ theo thế cờ (FEN) nên "Đi lại" rồi đi nước khác vẫn đúng.

import { useEffect, useMemo, useRef, useState } from "react";
import { useEngine } from "@/hooks/useEngine";
import { CLASS_NAME, reviewMove, type MoveReview, type PositionEval } from "@/lib/xiangqi/analysis";
import { toFen, type Side } from "@/lib/xiangqi/engine";
import { explainText, moveIdea } from "@/lib/xiangqi/explain";
import type { GameState } from "@/lib/xiangqi/game";
import { openingOf } from "@/lib/xiangqi/openings";
import game from "@/app/game/[id]/game.module.css";
import styles from "./play.module.css";

/** Cùng mức với màn phân tích ván: đủ nhanh để chấm kịp trong lúc máy suy nghĩ. */
const COACH = { depth: 3, timeMs: 300, noise: 0 } as const;

interface CachedCoachItem {
  review: MoveReview;
  scoreLoss: number | null;
  best: boolean;
  idea: string;
}

export function LiveCoach({ state, player }: { state: GameState; player: Side }) {
  const think = useEngine();
  const [cache, setCache] = useState<Record<string, PositionEval>>({});
  // Cache kết quả theo cặp FEN trước - sau để tránh tính lại toàn bộ ván cờ
  const coachCache = useRef<Map<string, CachedCoachItem>>(new Map());
  const fens = useMemo(() => state.history.map((p) => toFen(p)), [state.history]);

  // Thế cần chấm: trước và sau mỗi nước của người chơi, kể cả thế hiện tại khi đến lượt người chơi (chấm sẵn).
  const pending = useMemo(() => {
    const need = new Set<number>();
    state.moves.forEach((m, i) => {
      if (m.side !== player) return;
      need.add(i);
      if (!(i + 1 === state.moves.length && state.result)) need.add(i + 1);
    });
    if (!state.result && state.history[state.history.length - 1].turn === player) need.add(state.history.length - 1);
    return [...need].sort((a, b) => b - a).map((i) => fens[i]).filter((f) => !cache[f]);
  }, [state, player, fens, cache]);

  const next = pending[0];
  useEffect(() => {
    if (!next) return;
    let cancelled = false;
    think(next, 3, COACH, "analysis")
      .then((res) => {
        if (!cancelled) setCache((c) => ({ ...c, [next]: { score: res.score, best: res.move, pv: res.pvMoves } }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [next, think]);

  const opening = useMemo(() => {
    const firstMove = state.moves[0]?.notation;
    const op = firstMove ? openingOf(firstMove) : null;
    return op && op.id !== "other" ? op.name : undefined;
  }, [state.moves]);

  const { mine, accuracy } = useMemo(() => {
    const items: (MoveReview & { ready: boolean; best: boolean; idea: string })[] = [];
    const accScores: number[] = [];

    state.moves.forEach((m, i) => {
      if (m.side !== player) return;

      const beforeEval = cache[fens[i]] ?? null;
      const afterEval = cache[fens[i + 1]] ?? null;
      const isTerminal = i + 1 === state.moves.length && !!state.result;
      const ready = !!beforeEval && (!!afterEval || isTerminal);

      if (!ready) {
        items.push({
          ply: i + 1,
          side: player,
          notation: m.notation,
          loss: 0,
          cls: null,
          better: null,
          facts: [],
          ready: false,
          best: false,
          idea: "",
        });
        return;
      }

      // Khóa cache theo cặp FEN trước và sau nước đi
      const fenPairKey = `${fens[i]}->${fens[i + 1]}`;
      let cached = coachCache.current.get(fenPairKey);

      if (!cached) {
        // Chỉ tính nước mới chưa có trong cache
        const { review, scoreLoss } = reviewMove(m, i, state, beforeEval, afterEval, opening);
        const best = sameMove(beforeEval?.best, m.move);
        const historyMoves = state.moves.slice(0, i).map((x) => x.move);
        const idea = explainText(
          [
            moveIdea(
              state.history[i].board,
              m.move,
              afterEval?.best ?? null,
              i,
              opening,
              historyMoves,
              best,
            ),
          ],
          m.side,
        );
        cached = { review, scoreLoss, best, idea };
        coachCache.current.set(fenPairKey, cached);
      }

      items.push({
        ...cached.review,
        ready: true,
        best: cached.best,
        idea: cached.idea,
      });

      if (cached.scoreLoss !== null) {
        accScores.push(Math.max(0, 100 - cached.scoreLoss / 3));
      }
    });

    const avg = accScores.length ? Math.round(accScores.reduce((a, b) => a + b, 0) / accScores.length) : null;
    return { mine: items.reverse(), accuracy: avg };
  }, [state, player, fens, cache, opening]);

  return (
    <div className={`card ${styles.panel}`} aria-live="polite">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Huấn luyện</h2>
        {accuracy !== null && <span className="muted">Độ chính xác {accuracy}%</span>}
      </div>
      {mine.length === 0 ? (
        <p className="muted">Mỗi nước bạn đi sẽ được AI chấm và giải thích ngay tại đây.</p>
      ) : (
        <ul className={game.reviewList}>
          {mine.map((m) => (
            <li key={m.ply}>
              <div className={game.reviewItem}>
                {!m.ready ? (
                  <span className={game.reviewTag}>Đang chấm…</span>
                ) : m.cls ? (
                  <span className={game.reviewTag} data-cls={m.cls}>{CLASS_NAME[m.cls]}</span>
                ) : (
                  <span className={game.reviewTag} data-cls="good">{m.best ? "Nước tốt nhất" : "Nước tốt"}</span>
                )}
                <span>
                  {Math.ceil(m.ply / 2)}. {m.notation}
                  {m.better && <span className="muted"> · nên đi {m.better}</span>}
                </span>
              </div>
              {m.facts.length > 0 && <p className={game.reviewNote}>{explainText(m.facts, m.side)}</p>}
              {m.line && m.line.length > 1 && (
                <p className={game.reviewLine}>
                  Biến tiếp diễn: {m.line.join(" ➔ ")}
                </p>
              )}
              {m.ready && <p className={`${game.reviewNote} muted`}>{m.idea}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const sameMove = (a: { from: number; to: number } | null | undefined, b: { from: number; to: number }) =>
  !!a && a.from === b.from && a.to === b.to;
