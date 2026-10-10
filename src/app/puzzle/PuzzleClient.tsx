"use client";

import { useEffect, useRef, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { ResultOverlay } from "@/components/game/GamePanels";
import { Move, applyMove, findKing, inCheck, legalMovesFrom, outcome, parseFen, sideOf } from "@/lib/xiangqi/engine";
import { PUZZLES } from "@/lib/xiangqi/puzzles";
import { playSound } from "@/lib/sound";
import styles from "./puzzle.module.css";

type Status = "play" | "wrong" | "solved";

/** Mã cố định cho quân (thế cờ thế chỉ có tối đa một nước trước khi đặt lại). */
function pieceIdsAfter(board: (string | null)[], last: Move | null): (number | null)[] {
  const ids = board.map((p, i) => (p ? i : null));
  if (last) ids[last.to] = last.from;
  return ids;
}

export function PuzzleClient() {
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const puzzle = PUZZLES[index];

  return (
    <main className={styles.layout}>
      <nav aria-label="Danh sách thế cờ" className={`card ${styles.list}`}>
        <h2 className={styles.listTitle}>{puzzle.chapter}</h2>
        {PUZZLES.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={styles.item}
            aria-current={i === index ? "true" : undefined}
            onClick={() => setIndex(i)}
          >
            <span className={`seal ${styles.itemSeal}`} data-done={solved.has(p.id) || undefined}>{i + 1}</span>
            <span className={styles.itemText}>
              <strong>{p.title}</strong>
              <span className="muted">{solved.has(p.id) ? "Đã giải" : "Chưa giải"}</span>
            </span>
          </button>
        ))}
      </nav>
      <PuzzleBoard
        key={puzzle.id}
        index={index}
        onSolved={() => setSolved((s) => new Set(s).add(puzzle.id))}
        onNext={index < PUZZLES.length - 1 ? () => setIndex(index + 1) : undefined}
      />
    </main>
  );
}

function PuzzleBoard({ index, onSolved, onNext }: { index: number; onSolved: () => void; onNext?: () => void }) {
  const puzzle = PUZZLES[index];
  const [pos, setPos] = useState(() => parseFen(puzzle.fen));
  const [status, setStatus] = useState<Status>("play");
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const reset = () => {
    clearTimeout(timer.current);
    setPos(parseFen(puzzle.fen));
    setStatus("play");
    setSelected(null);
    setLastMove(null);
  };

  const targets = selected !== null ? legalMovesFrom(pos, selected).map((m) => m.to) : [];
  const checkSquare = inCheck(pos.board, pos.turn) ? findKing(pos.board, pos.turn) : null;

  const onSquareClick = (i: number) => {
    if (status !== "play") return;
    const p = pos.board[i];
    if (p && sideOf(p) === pos.turn) {
      setSelected(selected === i ? null : i);
      return;
    }
    if (selected === null || !targets.includes(i)) {
      setSelected(null);
      return;
    }
    const move = { from: selected, to: i };
    const next = applyMove(pos, move);
    const o = outcome(next);
    playSound(o.over ? "check" : pos.board[move.to] ? "capture" : inCheck(next.board, next.turn) ? "check" : "move");
    setPos(next);
    setLastMove(move);
    setSelected(null);
    setTries((t) => t + 1);
    if (o.over && o.winner === "r") {
      setStatus("solved");
      setTimeout(() => playSound("win"), 250);
      onSolved();
    } else {
      setStatus("wrong");
      timer.current = setTimeout(reset, 1200);
    }
  };

  const stars = tries === 1 && !hint ? 3 : tries <= 3 ? 2 : 1;
  const message =
    status === "solved" ? `Chính xác! Ví dụ lời giải: ${puzzle.solutionText}.`
      : status === "wrong" ? "Chưa chiếu bí. Thử lại nhé!"
        : hint ? `Gợi ý: ${puzzle.hint}`
          : "Đến lượt Đỏ. Chọn quân để bắt đầu.";

  return (
    <>
      <section className={styles.center} aria-label="Bàn cờ thế">
        <XiangqiBoard
          board={pos.board}
          ids={pieceIdsAfter(pos.board, lastMove)}
          selected={selected}
          targets={targets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          hintSquare={hint && status === "play" ? puzzle.solution.from : null}
          disabled={status !== "play"}
          onSquareClick={onSquareClick}
        >
          {status === "solved" && (
            <ResultOverlay seal="絕殺" title="Chiếu bí! Giải đúng thế cờ." detail={`${stars} sao`}>
              <button type="button" className="btn" onClick={reset}>Chơi lại</button>
              {onNext && <button type="button" className="btn btn-primary" onClick={onNext}>Thế tiếp theo</button>}
            </ResultOverlay>
          )}
        </XiangqiBoard>
      </section>

      <aside className={styles.info}>
        <div className={`card ${styles.panel}`}>
          <span className={styles.kicker}>{puzzle.chapter.toUpperCase()} · THẾ {index + 1} / {PUZZLES.length}</span>
          <h1 className={styles.title}>{puzzle.title}</h1>
          <p className="muted">{puzzle.goal}</p>
          <div className={styles.message} data-status={status} role="status">{message}</div>
          <span className="muted">Số lần thử: <strong>{tries}</strong></span>
        </div>
        <div className={styles.actions}>
          <button type="button" className="btn" onClick={() => setHint(true)} disabled={hint || status !== "play"}>Gợi ý</button>
          <button type="button" className="btn" onClick={reset}>Đặt lại</button>
        </div>
      </aside>
    </>
  );
}
