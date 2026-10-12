"use client";

// Huấn luyện khi đánh với máy: chấm ngay từng nước của người chơi bằng một AI riêng (worker thứ hai,
// không tranh với máy đang đánh). Điểm được nhớ theo thế cờ (FEN) nên "Đi lại" rồi đi nước khác vẫn đúng.

import { useEffect, useMemo, useRef, useState } from "react";
import { useEngine } from "@/hooks/useEngine";
import { CLASS_NAME, reviewGame, type PositionEval } from "@/lib/xiangqi/analysis";
import { toFen, type Side } from "@/lib/xiangqi/engine";
import { explainText, moveIdea } from "@/lib/xiangqi/explain";
import type { GameState } from "@/lib/xiangqi/game";
import game from "@/app/game/[id]/game.module.css";
import styles from "./play.module.css";

/** Cùng mức với màn phân tích ván: đủ nhanh để chấm kịp trong lúc máy suy nghĩ. */
const COACH = { depth: 3, timeMs: 300, noise: 0 } as const;

export function LiveCoach({ state, player }: { state: GameState; player: Side }) {
  const think = useEngine();
  const [cache, setCache] = useState<Record<string, PositionEval>>({});
  const ideaCache = useRef<Map<string, string>>(new Map());
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

  const evals = useMemo(() => fens.map((f) => cache[f] ?? null), [fens, cache]);
  const review = useMemo(() => reviewGame(state, evals), [state, evals]);
  const mine = review.moves
    .map((r, i) => ({ ...r, ready: !!evals[i] && (!!evals[i + 1] || (i + 1 === state.moves.length && !!state.result)), best: sameMove(evals[i]?.best, state.moves[i].move) }))
    .filter((r) => r.side === player)
    .map((r) => {
      let idea = "";
      if (r.ready) {
        const key = `${r.ply}:${state.moves[r.ply - 1].move.from}-${state.moves[r.ply - 1].move.to}:${r.best}`;
        if (ideaCache.current.has(key)) {
          idea = ideaCache.current.get(key)!;
        } else {
          const historyMoves = state.moves.slice(0, r.ply - 1).map((m) => m.move);
          idea = explainText(
            [
              moveIdea(
                state.history[r.ply - 1].board,
                state.moves[r.ply - 1].move,
                evals[r.ply]?.best ?? null,
                r.ply - 1,
                review.opening,
                historyMoves,
                r.best,
              ),
            ],
            r.side,
          );
          ideaCache.current.set(key, idea);
        }
      }
      return {
        ...r,
        idea,
      };
    })
    .reverse();

  return (
    <div className={`card ${styles.panel}`} aria-live="polite">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Huấn luyện</h2>
        {review.accuracy[player] !== null && <span className="muted">Độ chính xác {review.accuracy[player]}%</span>}
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
