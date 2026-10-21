"use client";

import { useMemo, useState } from "react";
import { moveNotation } from "@/lib/xiangqi/notation";
import { applyMove, findKing, inCheck, legalMovesFrom, sideOf, type Move, type Position } from "@/lib/xiangqi/engine";
import styles from "./broadcast.module.css";

/**
 * Đi thử: người dẫn bày một biến trên bàn cờ tạm để giải thích, ván thật (đồng hồ, nước đọc từ trang nguồn) vẫn chạy
 * ngầm. Có nước thật mới trong lúc thử thì chỉ báo — người dẫn tự bấm thoát.
 */
export interface Trial {
  /** Thế cờ bắt đầu thử. */
  base: Position;
  /** Số nước của ván thật lúc bắt đầu thử (để biết ván thật đã đi thêm). */
  startCount: number;
  moves: { move: Move; notation: string }[];
}

export type TrialAction =
  | { type: "start"; base: Position; startCount: number }
  | { type: "move"; move: Move }
  | { type: "back" }
  | { type: "exit" };

export function trialReducer(trial: Trial | null, action: TrialAction): Trial | null {
  switch (action.type) {
    case "start":
      return { base: action.base, startCount: action.startCount, moves: [] };
    case "exit":
      return null;
    case "move": {
      if (!trial) return trial;
      const pos = trialPosition(trial);
      return { ...trial, moves: [...trial.moves, { move: action.move, notation: moveNotation(pos.board, action.move) }] };
    }
    case "back":
      return trial && trial.moves.length ? { ...trial, moves: trial.moves.slice(0, -1) } : trial;
  }
}

export function trialPosition(trial: Trial): Position {
  return trial.moves.reduce((p, m) => applyMove(p, m.move), trial.base);
}

/** Trạng thái đi thử cho trang điều khiển. `liveNotations`: biên bản ván thật, để báo nước thật mới khi đang thử. */
export function useTrialMoves(liveNotations: string[]) {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const dispatch = (action: TrialAction) => {
    setTrial((t) => trialReducer(t, action));
    setSelected(null);
  };

  const pos = useMemo(() => (trial ? trialPosition(trial) : null), [trial]);
  const targets = useMemo(
    () => (pos && selected !== null ? legalMovesFrom(pos, selected).map((m) => m.to) : []),
    [pos, selected],
  );
  /** Phần trạng thái sân khấu thay bằng biến thử (null = không thử). Memo để effect gửi sân khấu không chạy mỗi lần render. */
  const stage = useMemo(() => {
    if (!trial || !pos) return null;
    return {
      board: pos.board,
      lastMove: trial.moves.at(-1)?.move ?? null,
      checkSquare: inCheck(pos.board, pos.turn) ? findKing(pos.board, pos.turn) : null,
      selected,
      targets,
      trial: { notations: trial.moves.map((m) => m.notation) },
    };
  }, [trial, pos, selected, targets]);

  const onSquareClick = (i: number) => {
    if (!pos) return;
    if (selected !== null && targets.includes(i)) {
      dispatch({ type: "move", move: { from: selected, to: i } });
      return;
    }
    const piece = pos.board[i];
    setSelected(piece && sideOf(piece) === pos.turn && i !== selected ? i : null);
  };

  return {
    trial,
    stage,
    onSquareClick,
    /** Ván thật có thay đổi kể từ lúc bắt đầu thử (nước mới, hoặc bị đặt lại). */
    realChanged: !!trial && liveNotations.length !== trial.startCount,
    realNewMoves: trial ? liveNotations.slice(trial.startCount) : [],
    start: (base: Position) => dispatch({ type: "start", base, startCount: liveNotations.length }),
    back: () => dispatch({ type: "back" }),
    exit: () => dispatch({ type: "exit" }),
  };
}

export type TrialControls = ReturnType<typeof useTrialMoves>;

/** Thanh dưới bàn cờ khi đang đi thử: chuỗi nước thử, lùi, thoát; báo khi ván thật vừa có nước. */
export function TrialBar({ t, onExit = t.exit }: { t: TrialControls; onExit?: () => void }) {
  if (!t.stage) return null;
  const notations = t.stage.trial.notations;
  return (
    <>
      <div className={styles.reviewBar}>
        🧪 Đang đi thử{notations.length ? `: ${notations.join(" → ")}` : " — bấm quân để bày biến"}
        <button type="button" className={styles.btn} onClick={t.back} disabled={!notations.length}>
          ↶ Lùi nước thử
        </button>
        <button type="button" className={styles.btnGold} onClick={onExit}>
          Thoát về ván thật
        </button>
      </div>
      {t.realChanged && (
        <p className={styles.warn} role="alert">
          ⚠ Ván thật vừa {t.realNewMoves.length ? `có nước mới: ${t.realNewMoves.join(", ")}` : "thay đổi"}. Sân khấu vẫn đang
          hiện biến thử — bấm “Thoát về ván thật” khi nói xong.
        </p>
      )}
    </>
  );
}
