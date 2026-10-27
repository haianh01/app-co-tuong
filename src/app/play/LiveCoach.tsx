"use client";

// Huấn luyện khi đánh với máy: chấm ngay từng nước của người chơi bằng một AI riêng (worker thứ hai,
// không tranh với máy đang đánh). Điểm được nhớ theo thế cờ (FEN) nên "Đi lại" rồi đi nước khác vẫn đúng.

import { useEffect, useMemo, useState } from "react";
import { useEngine } from "@/hooks/useEngine";
import { CLASS_NAME, reviewMove, type MoveReview, type PositionEval } from "@/lib/xiangqi/analysis";
import { toFen, type Side } from "@/lib/xiangqi/engine";
import { explainText, moveIdea, withoutCriticism, type CommentaryStyle, type Fact } from "@/lib/xiangqi/explain";
import type { GameState } from "@/lib/xiangqi/game";
import { explainMovePlan, type MovePlanFact } from "@/lib/xiangqi/move-plan";
import { openingOf } from "@/lib/xiangqi/openings";
import { punishmentNotes } from "@/lib/xiangqi/story";
import game from "@/app/game/[id]/game.module.css";
import styles from "./play.module.css";

/** Cùng mức với màn phân tích ván: đủ nhanh để chấm kịp trong lúc máy suy nghĩ. */
const COACH = { depth: 3, timeMs: 300, noise: 0 } as const;

interface CachedCoachItem {
  review: MoveReview;
  scoreLoss: number | null;
  accuracy?: number | null;
  best: boolean;
  idea: string;
  /** Kế hoạch của nước đã đi (và của nước AI gợi ý nếu nước bị chấm lỗi), xem move-plan.ts. */
  movePlan: string;
  betterPlan: string;
}

export function LiveCoach({ state, player }: { state: GameState; player: Side }) {
  const think = useEngine();
  const [commentaryStyle, setCommentaryStyle] = useState<CommentaryStyle>("default");
  const [cache, setCache] = useState<Record<string, PositionEval>>({});
  // Cache kết quả theo cặp FEN trước - sau để tránh tính lại toàn bộ ván cờ
  // Nước của máy cũng được chấm (không hiển thị) để biết máy có sai và bạn có trừng phạt được không.
  // Cache chỉ để nhớ kết quả tính, không gây render lại: giữ cùng một object suốt vòng đời component.
  const [{ coachCache, machineCache }] = useState(() => ({
    coachCache: new Map<string, CachedCoachItem>(),
    machineCache: new Map<string, MoveReview>(),
  }));
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
    const items: (MoveReview & { ready: boolean; best: boolean; idea: string; movePlan: string; betterPlan: string; actualReply?: string; story?: string[] })[] = [];
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
          movePlan: "",
          betterPlan: "",
        });
        return;
      }

      // Khóa cache theo cặp FEN trước và sau nước đi
      const fenPairKey = `${fens[i]}->${fens[i + 1]}`;
      let cached = coachCache.get(fenPairKey);

      if (!cached) {
        // Chỉ tính nước mới chưa có trong cache
        const { review, scoreLoss, accuracy: moveAcc } = reviewMove(m, i, state, beforeEval, afterEval, opening);
        const best = sameMove(beforeEval?.best, m.move);
        const historyMoves = state.moves.slice(0, i).map((x) => x.move);
        // Nước không bị chấm lỗi thì không chê (kể cả lỗi khai cuộc), tránh "Nước tốt" đi kèm câu chê
        const isFault = review.cls === "blunder" || review.cls === "mistake" || review.cls === "inaccuracy" || review.cls === "missedWin";
        // Truyền PV và điểm engine để ý đồ được xác nhận bằng engine như lúc chấm trên ván đại sư
        const fact = moveIdea(
          state.history[i].board,
          m.move,
          afterEval?.best ?? null,
          i,
          opening,
          historyMoves,
          best || !isFault,
          afterEval?.pv,
          {
            evalBefore: { score: beforeEval.score },
            evalAfter: afterEval ? { score: afterEval.score } : null,
            loss: review.loss,
          },
        );
        const idea = explainText(
          [isFault ? fact : withoutCriticism(fact)],
          m.side,
          i + 1,
        );
        const planText = (p: MovePlanFact | null) =>
          p ? [p.steps.map((st) => st.text).join("; "), p.aim && `Hướng chung: ${p.aim}`].filter(Boolean).join(". ") : "";
        const movePlan = planText(explainMovePlan(state.history[i].board, m.move, afterEval?.pv ?? [], { ply: i }));
        const betterPlan = isFault && review.betterMove
          ? planText(explainMovePlan(state.history[i].board, review.betterMove, review.betterPvMoves ?? [], { ply: i }))
          : "";
        cached = { review, scoreLoss, accuracy: moveAcc, best, idea, movePlan, betterPlan };
        coachCache.set(fenPairKey, cached);
      }

      items.push({
        ...cached.review,
        ready: true,
        best: cached.best,
        idea: cached.idea,
        movePlan: cached.movePlan,
        betterPlan: cached.betterPlan,
        // Nước đối phương thật sự đã đi (nếu có), để đối chiếu với biến AI dự tính
        actualReply: state.moves[i + 1]?.notation,
      });

      if (cached.accuracy !== null && cached.accuracy !== undefined) {
        accScores.push(cached.accuracy);
      } else if (cached.scoreLoss !== null) {
        accScores.push(Math.max(0, 100 - cached.scoreLoss / 3));
      }
    });

    // Diễn biến: sai lầm có bị trừng phạt không, giữa bạn và máy. Nước của máy chấm bằng điểm đã có trong cache;
    // thiếu điểm thì chỉ giữ tọa độ (vẫn đủ để biết máy có đi đúng nước trừng phạt bạn không).
    const byPly = new Map(items.filter((x) => x.ready).map((x) => [x.ply, x as MoveReview]));
    const seq: MoveReview[] = state.moves.map((m, i) => {
      const mine = byPly.get(i + 1);
      if (mine) return mine;
      const stub: MoveReview = { ply: i + 1, side: m.side, notation: m.notation, move: m.move, loss: 0, cls: null, better: null, facts: [] };
      const before = cache[fens[i]];
      const after = cache[fens[i + 1]];
      if (m.side === player || !before || !after) return stub;
      const key = `${fens[i]}->${fens[i + 1]}`;
      let r = machineCache.get(key);
      if (!r) {
        r = reviewMove(m, i, state, before, after, opening).review;
        machineCache.set(key, r);
      }
      return r;
    });
    const names = { [player]: "bạn", [player === "r" ? "b" : "r"]: "máy" } as Record<Side, string>;
    for (const n of punishmentNotes(seq, names)) {
      // Ghi chú ở nước của máy (máy trừng phạt bạn) gắn vào nước của bạn ngay trước đó
      const target = items.find((x) => x.ply === (n.side === player ? n.ply : n.ply - 1));
      if (target) (target.story ??= []).push(n.text);
    }

    const avg = accScores.length ? Math.round(accScores.reduce((a, b) => a + b, 0) / accScores.length) : null;
    return { mine: items.reverse(), accuracy: avg };
  }, [state, player, fens, cache, opening, coachCache, machineCache]);

  return (
    <div className={`card ${styles.panel}`} aria-live="polite">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Huấn luyện</h2>
        {accuracy !== null && <span className="muted">Độ chính xác {accuracy}%</span>}
      </div>
      <div className={game.personaBar} style={{ margin: "6px 0 10px" }}>
        <span className={game.personaLabel}>Góc nhìn:</span>
        <div className={game.personaButtons}>
          <button
            type="button"
            className={`${game.personaBtn} ${commentaryStyle === "default" ? game.personaActiveDefault : ""}`}
            onClick={() => setCommentaryStyle("default")}
            title="Lời bình trung tính, không theo phong cách đại sư nào"
          >
            <span>Trung tính</span>
          </button>
          <button
            type="button"
            className={`${game.personaBtn} ${commentaryStyle === "zhaoXinxin" ? game.personaActiveZhao : ""}`}
            onClick={() => setCommentaryStyle("zhaoXinxin")}
            title="Triệu Hâm Hâm: Công sát mãnh liệt, phế quân đoạt thế"
          >
            <span>⚔️</span>
            <span>Triệu Hâm Hâm</span>
          </button>
          <button
            type="button"
            className={`${game.personaBtn} ${commentaryStyle === "xuYinchuan" ? game.personaActiveXu : ""}`}
            onClick={() => setCommentaryStyle("xuYinchuan")}
            title="Hứa Ngân Xuyên: Dĩ nhu khắc cương, phòng thủ kiên cố"
          >
            <span>🛡️</span>
            <span>Hứa Ngân Xuyên</span>
          </button>
        </div>
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
              {(() => {
                const zhaoFact = m.facts?.find((f): f is Fact & { lesson?: number; lessonTitle?: string; quote?: { text: string; at: string }; videoUrl?: string } => (f.kind === "zhaoMiddlegame" || f.kind === "endgamePrinciple" || f.kind === "zhaoOpening") && (f as { lesson?: number }).lesson !== undefined);
                const note = explainText(m.facts, m.side, m.ply, commentaryStyle);
                return (
                  <>
                    {commentaryStyle === "zhaoXinxin" && zhaoFact && (
                      <div className={game.zhaoLessonBadgeContainer}>
                        <span className={game.zhaoLessonBadge}>
                          📖 Kỳ lý #{zhaoFact.lesson}: {zhaoFact.lessonTitle}
                        </span>
                        {zhaoFact.videoUrl && (
                          <a
                            href={zhaoFact.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={game.zhaoVideoBtn}
                            title="Xem bài giảng Triệu Hâm Hâm trên YouTube"
                          >
                            ▶️ Xem bài giảng {zhaoFact.quote ? `(${zhaoFact.quote.at})` : ""}
                          </a>
                        )}
                      </div>
                    )}
                    {note && <p className={game.reviewNote}>{note}</p>}
                  </>
                );
              })()}
              {m.line && m.line.length > 1 && (
                <p className={game.reviewLine}>
                  Biến AI dự tính: {m.line.join(" ➔ ")}
                  {m.actualReply && m.actualReply !== m.line[0] && (
                    <span className="muted"> · thực tế đối phương đi {m.actualReply}</span>
                  )}
                </p>
              )}
              {m.story?.map((t) => (
                <p key={t} className={game.reviewNote}>
                  ⚡ {t}
                </p>
              ))}
              {m.ready && <p className={`${game.reviewNote} muted`}>{m.idea}</p>}
              {m.ready && m.movePlan && <p className={game.reviewNote}>🧭 {m.movePlan}</p>}
              {m.ready && m.betterPlan && (
                <p className={game.reviewNote}>💡 Nếu đi {m.better}: {m.betterPlan}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const sameMove = (a: { from: number; to: number } | null | undefined, b: { from: number; to: number }) =>
  !!a && a.from === b.from && a.to === b.to;
