"use client";

import type { CSSProperties, ReactNode } from "react";
import { Board, Move, Side, colOf, rowOf, sideOf, typeOf } from "@/lib/xiangqi/engine";
import { PIECE_CHAR, PIECE_NAME } from "@/lib/xiangqi/notation";
import styles from "./XiangqiBoard.module.css";

// Hình học bàn cờ trong hệ tọa độ SVG; mọi vị trí HTML được quy ra % để bàn cờ co giãn.
const CELL = 58;
const PAD_X = 40;
const PAD_Y = 54; // rộng hơn PAD_X để chừa chỗ cho hàng số cột trên và dưới
const W = 8 * CELL + 2 * PAD_X;
const H = 9 * CELL + 2 * PAD_Y;
const PIECE = 52;
const TARGET = 44;
const HAN_FONT = 27;

const px = (dc: number) => PAD_X + dc * CELL;
const py = (dr: number) => PAD_Y + dr * CELL;
const pctX = (x: number) => `${(x / W) * 100}%`;
const pctY = (y: number) => `${(y / H) * 100}%`;

// Kích thước phần tử HTML tính theo bề rộng bàn cờ, để co giãn cùng SVG.
const BOARD_VARS = {
  aspectRatio: `${W} / ${H}`,
  "--piece-size": `${(PIECE / W) * 100}%`,
  "--target-size": `${(TARGET / W) * 100}%`,
  "--han-size": `${(HAN_FONT / W) * 100}cqw`,
} as CSSProperties;

const GRID_PATH = (() => {
  let d = "";
  for (let r = 0; r < 10; r++) d += `M${px(0)} ${py(r)}H${px(8)}`;
  for (let c = 0; c < 9; c++) {
    d += c === 0 || c === 8
      ? `M${px(c)} ${py(0)}V${py(9)}`
      : `M${px(c)} ${py(0)}V${py(4)}M${px(c)} ${py(5)}V${py(9)}`;
  }
  d += `M${px(3)} ${py(0)}L${px(5)} ${py(2)}M${px(5)} ${py(0)}L${px(3)} ${py(2)}`;
  d += `M${px(3)} ${py(7)}L${px(5)} ${py(9)}M${px(5)} ${py(7)}L${px(3)} ${py(9)}`;
  return d;
})();

// Dấu góc ở vị trí pháo và tốt.
const MARK_PATH = (() => {
  const spots: [number, number][] = [[2, 1], [2, 7], [7, 1], [7, 7]];
  for (const r of [3, 6]) for (const c of [0, 2, 4, 6, 8]) spots.push([r, c]);
  const g = 4;
  const l = 10;
  let d = "";
  for (const [r, c] of spots) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue;
      const x = px(c);
      const y = py(r);
      d += `M${x + sx * (g + l)} ${y + sy * g}H${x + sx * g}V${y + sy * (g + l)}`;
    }
  }
  return d;
})();

export interface XiangqiBoardProps {
  board: Board;
  /** Phe ở phía dưới màn hình. */
  orientation?: Side;
  selected?: number | null;
  targets?: number[];
  lastMove?: Move | null;
  checkSquare?: number | null;
  hintSquare?: number | null;
  disabled?: boolean;
  onSquareClick?: (index: number) => void;
  children?: ReactNode;
}

export function XiangqiBoard({
  board,
  orientation = "r",
  selected = null,
  targets = [],
  lastMove = null,
  checkSquare = null,
  hintSquare = null,
  disabled = false,
  onSquareClick,
  children,
}: XiangqiBoardProps) {
  const flip = orientation === "b";
  const place = (i: number) => {
    const dr = flip ? 9 - rowOf(i) : rowOf(i);
    const dc = flip ? 8 - colOf(i) : colOf(i);
    return { x: px(dc), y: py(dr) };
  };
  const at = (i: number): CSSProperties => {
    const { x, y } = place(i);
    return { left: pctX(x), top: pctY(y) };
  };
  const targetSet = new Set(targets);
  const click = (i: number) => () => {
    if (!disabled) onSquareClick?.(i);
  };

  return (
    <div className={styles.rim}>
      <div className={styles.board} style={BOARD_VARS} data-disabled={disabled || undefined}>
        <svg className={styles.lines} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <rect x={PAD_X - 7} y={PAD_Y - 7} width={8 * CELL + 14} height={9 * CELL + 14} className={styles.frame} />
          <path d={GRID_PATH} className={styles.grid} />
          <path d={MARK_PATH} className={styles.grid} />
          <text x={px(2)} y={py(4.5)} className={styles.river}>楚 河</text>
          <text x={px(6)} y={py(4.5)} className={styles.river}>漢 界</text>
          {/* Số cột: hàng trên theo cách đếm của bên trên, hàng dưới theo bên dưới (đều đếm từ phải sang). */}
          {Array.from({ length: 9 }, (_, dc) => (
            <g key={dc} className={styles.label}>
              <text x={px(dc)} y={15}>{dc + 1}</text>
              <text x={px(dc)} y={H - 15}>{9 - dc}</text>
            </g>
          ))}
        </svg>

        {lastMove && <span className={styles.lastFrom} style={at(lastMove.from)} aria-hidden="true" />}

        {board.map((p, i) => {
          if (!p) return null;
          const red = sideOf(p) === "r";
          const cls = [
            styles.piece,
            red ? styles.red : styles.black,
            i === selected && styles.selected,
            lastMove?.to === i && styles.lastTo,
            i === checkSquare && styles.inCheck,
            i === hintSquare && styles.hint,
            targetSet.has(i) && styles.capturable,
          ].filter(Boolean).join(" ");
          return (
            <button
              key={i}
              type="button"
              className={cls}
              style={at(i)}
              onClick={click(i)}
              data-square={i}
              aria-label={`${PIECE_NAME[typeOf(p)]} ${red ? "đỏ" : "đen"}`}
              aria-pressed={i === selected}
            >
              <span className={styles.face}>{PIECE_CHAR[p]}</span>
            </button>
          );
        })}

        {targets.filter((t) => !board[t]).map((t) => (
          <button key={`t${t}`} type="button" className={styles.target} style={at(t)} onClick={click(t)} data-square={t} aria-label="Đi tới ô này">
            <span />
          </button>
        ))}

        {children}
      </div>
    </div>
  );
}
