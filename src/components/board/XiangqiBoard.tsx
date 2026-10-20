"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useSession } from "@/components/session/SessionProvider";
import { boardSkin, pieceSkin } from "@/lib/skins";
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
/** Kéo quá khoảng này (px) mới tính là kéo thả, nhỏ hơn là bấm. */
const DRAG_THRESHOLD = 6;

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

/** Quân úp của cờ úp: "H" (đỏ) và "h" (đen). */
const isHidden = (p: string) => p === "H" || p === "h";

export interface BoardArrow {
  from: number;
  to: number;
  kind?: "played" | "better" | "reply" | "custom";
  color?: string;
  dashed?: boolean;
}

export interface BoardHighlight {
  square: number;
  color?: string;
}

export interface XiangqiBoardProps {
  board: Board;
  /** Mã cố định của từng quân (xem pieceIds) để vẽ hiệu ứng quân trượt khi di chuyển. */
  ids?: (number | null)[];
  /** Phe ở phía dưới màn hình. */
  orientation?: Side;
  selected?: number | null;
  targets?: number[];
  lastMove?: Move | null;
  checkSquare?: number | null;
  hintSquare?: number | null;
  disabled?: boolean;
  onSquareClick?: (index: number) => void;
  /** Ép dùng skin cụ thể (xem trước trong cửa hàng); mặc định theo skin người chơi đang dùng. */
  skin?: { board?: string; piece?: string };
  children?: ReactNode;
  /** Các mũi tên vẽ SVG trên bàn cờ (nước đã đi, nước nên đi, nước đáp). */
  arrows?: BoardArrow[];
  /** Các ô cờ cần làm nổi bật (highlights), hỗ trợ số ô hoặc đối tượng kèm màu. */
  highlights?: (number | BoardHighlight)[];
  /** Màu nét vẽ phác thảo khi rê chuột (mặc định #3b82f6). */
  sketchColor?: string;
  /**
   * Chế độ vẽ (bình luận): một lớp phủ nhận thao tác thay cho quân cờ. Kéo từ ô này sang ô khác gọi
   * onAnnotate(từ, đến) để vẽ mũi tên; bấm một ô gọi onAnnotate(ô, ô) để khoanh ô đó.
   */
  /** Tùy chọn độ phóng to bề dày mũi tên và đầu mũi tên (cho màn hình điện thoại / livestream sân khấu). */
  arrowWidthScale?: number;
  /** Bật hiệu ứng vẽ từ từ của mũi tên (stroke-dashoffset animation). */
  animateArrows?: boolean;
  /** Lớp CSS gắn ngoài viền bàn cờ để ghi đè kích thước/bố cục nếu cần. */
  className?: string;
  onAnnotate?: (from: number, to: number) => void;
}

export function XiangqiBoard({
  board,
  ids,
  orientation = "r",
  selected = null,
  targets = [],
  lastMove = null,
  checkSquare = null,
  hintSquare = null,
  disabled = false,
  onSquareClick,
  skin,
  children,
  arrows = [],
  highlights = [],
  sketchColor = "#3b82f6",
  arrowWidthScale = 1,
  animateArrows = false,
  className,
  onAnnotate,
}: XiangqiBoardProps) {
  const { user } = useSession();
  const boardRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ square: number; x: number; y: number; id: number } | null>(null);
  const handledByPointer = useRef(false);
  const [drag, setDrag] = useState<{ square: number; dx: number; dy: number } | null>(null);
  const [sketch, setSketch] = useState<{ from: number; to: number } | null>(null);

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
  const select = useCallback(
    (i: number) => {
      if (!disabled) onSquareClick?.(i);
    },
    [disabled, onSquareClick],
  );

  /** Ô gần nhất dưới con trỏ (tọa độ màn hình). */
  const squareAt = useCallback(
    (clientX: number, clientY: number): number | null => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const dc = Math.round((((clientX - rect.left) / rect.width) * W - PAD_X) / CELL);
      const dr = Math.round((((clientY - rect.top) / rect.height) * H - PAD_Y) / CELL);
      if (dc < 0 || dc > 8 || dr < 0 || dr > 9) return null;
      return (flip ? 9 - dr : dr) * 9 + (flip ? 8 - dc : dc);
    },
    [flip],
  );

  // Khi bàn cờ thay đổi (nước đi vừa hoàn thành) hoặc bị vô hiệu hóa, dọn sạch hoàn toàn trạng thái kéo.
  // State kéo được đặt lại ngay khi render (so với lần trước); ref con trỏ không được ghi lúc render nên dọn trong effect.
  const [dragScope, setDragScope] = useState({ board, disabled });
  if (dragScope.board !== board || dragScope.disabled !== disabled) {
    setDragScope({ board, disabled });
    setDrag(null);
  }
  useEffect(() => {
    pointer.current = null;
  }, [board, disabled]);

  // Lắng nghe di chuyển và nhả chuột toàn cục trên window để đảm bảo dọn sạch kéo thả
  // ngay cả khi con trỏ di chuyển ra ngoài quân cờ hay quân cờ bị gỡ khỏi DOM (khi ăn quân).
  useEffect(() => {
    const onWindowPointerMove = (e: globalThis.PointerEvent) => {
      const p = pointer.current;
      if (!p || e.pointerId !== p.id) return;

      // Chuột không còn nút nào được nhấn (e.buttons === 0) -> hủy kéo ngay lập tức
      if (e.buttons === 0) {
        pointer.current = null;
        setDrag(null);
        return;
      }

      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (drag || Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        setDrag({ square: p.square, dx, dy });
      }
    };

    const onWindowPointerUp = (e: globalThis.PointerEvent) => {
      const p = pointer.current;
      if (!p || e.pointerId !== p.id) return;
      pointer.current = null;
      setDrag(null);

      // Thả chuột sau khi đã kéo quá khoảng ngưỡng
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= DRAG_THRESHOLD) {
        const target = squareAt(e.clientX, e.clientY);
        if (target !== null && target !== p.square) {
          select(target);
        }
      }
    };

    const onWindowPointerCancel = (e: globalThis.PointerEvent) => {
      if (pointer.current && e.pointerId === pointer.current.id) {
        pointer.current = null;
        setDrag(null);
      }
    };

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerCancel);
    };
  }, [drag, squareAt, select]);

  // Kéo thả chỉ dành cho chuột/bút. Trên màn hình cảm ứng dùng chạm-chọn rồi chạm ô đích
  // (như các app cờ phổ biến) để không chặn thao tác cuộn trang.
  const onPointerDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.pointerType === "touch" || e.button !== 0) return;

    // Nếu ô này là mục tiêu ăn quân (đối phương), không bắt đầu kéo quân đối phương!
    // Việc ăn quân sẽ được xử lý khi click/thả chuột lên ô này.
    if (targetSet.has(i)) {
      return;
    }

    handledByPointer.current = true;
    pointer.current = { square: i, x: e.clientX, y: e.clientY, id: e.pointerId };
    select(i);
  };

  const onPieceClick = (i: number) => () => {
    // Chuột đã xử lý ở pointerdown; còn lại là chạm (cảm ứng) hoặc bàn phím, hoặc ăn quân.
    if (handledByPointer.current) {
      handledByPointer.current = false;
      return;
    }
    select(i);
  };

  const b = boardSkin(skin?.board ?? user?.boardSkin);
  const pc = pieceSkin(skin?.piece ?? user?.pieceSkin);
  const theme = {
    "--board": b.board,
    "--board-line": b.line,
    "--board-rim": b.rim,
    "--piece-face": pc.face,
    "--piece-red": pc.red,
    "--piece-black": pc.black,
    "--piece-edge": pc.edge,
  } as CSSProperties;

  return (
    <div className={`${styles.rim} ${className ?? ""}`.trim()} style={theme}>
      <div ref={boardRef} className={styles.board} style={BOARD_VARS} data-disabled={disabled || undefined}>
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
          const hidden = isHidden(p);
          const dragging = drag?.square === i;
          const cls = [
            styles.piece,
            red ? styles.red : styles.black,
            hidden && styles.hidden,
            i === selected && styles.selected,
            lastMove?.to === i && styles.lastTo,
            i === checkSquare && styles.inCheck,
            i === hintSquare && styles.hint,
            targetSet.has(i) && styles.capturable,
            dragging && styles.dragging,
          ].filter(Boolean).join(" ");
          const style = dragging
            ? { ...at(i), transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.08)` }
            : at(i);
          return (
            <button
              key={ids?.[i] ?? `sq${i}`}
              type="button"
              className={cls}
              style={style}
              onClick={onPieceClick(i)}
              onPointerDown={onPointerDown(i)}
              onDragStart={(e) => e.preventDefault()}
              data-square={i}
              aria-label={hidden ? `Quân úp ${red ? "đỏ" : "đen"}` : `${PIECE_NAME[typeOf(p)]} ${red ? "đỏ" : "đen"}`}
              aria-pressed={i === selected}
            >
              <span className={styles.face}>{hidden ? "" : PIECE_CHAR[p]}</span>
            </button>
          );
        })}

        {targets.filter((t) => !board[t]).map((t) => (
          <button
            key={`t${t}`}
            type="button"
            className={styles.target}
            style={at(t)}
            onClick={() => select(t)}
            onDragStart={(e) => e.preventDefault()}
            data-square={t}
            aria-label="Đi tới ô này"
          >
            <span />
          </button>
        ))}

        {(arrows.length > 0 || highlights.length > 0) && (
          <svg className={styles.overlays} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <defs>
              <marker id="arrowhead-better" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#22c55e" />
              </marker>
              <marker id="arrowhead-played" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ef4444" />
              </marker>
              <marker id="arrowhead-reply" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#f59e0b" />
              </marker>
              <marker id="arrowhead-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#3b82f6" />
              </marker>
              <marker id="arrowhead-green" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#22c55e" />
              </marker>
              <marker id="arrowhead-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ef4444" />
              </marker>
              <marker id="arrowhead-yellow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#f59e0b" />
              </marker>
              <marker id="arrowhead-custom" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#3b82f6" />
              </marker>
            </defs>

            {/* Highlights các ô */}
            {highlights.map((hl, idx) => {
              const sq = typeof hl === "number" ? hl : hl.square;
              const color = typeof hl === "number" ? "#f59e0b" : (hl.color ?? "#f59e0b");
              const pt = place(sq);
              const fillColor = color.startsWith("#") ? `${color}38` : "rgba(245, 158, 11, 0.22)";
              return (
                <g key={`hl-${idx}-${sq}`}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={24}
                    fill={fillColor}
                    stroke={color}
                    strokeWidth={2.5 * arrowWidthScale}
                    strokeDasharray="5 3"
                  />
                </g>
              );
            })}

            {/* Mũi tên */}
            {arrows.map((a, idx) => {
              const p1 = place(a.from);
              const p2 = place(a.to);
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.hypot(dx, dy);
              if (dist === 0) return null;

              const ux = dx / dist;
              const uy = dy / dist;
              const startX = p1.x + ux * 16;
              const startY = p1.y + uy * 16;
              const endX = p2.x - ux * (20 + 2 * arrowWidthScale);
              const endY = p2.y - uy * (20 + 2 * arrowWidthScale);

              const kind = a.kind ?? "played";
              const strokeColor =
                a.color ??
                (kind === "better"
                  ? "#22c55e"
                  : kind === "reply"
                  ? "#f59e0b"
                  : kind === "custom"
                  ? "#3b82f6"
                  : "#ef4444");

              const colorMarkerMap: Record<string, string> = {
                "#3b82f6": "arrowhead-blue",
                "#22c55e": "arrowhead-green",
                "#ef4444": "arrowhead-red",
                "#f59e0b": "arrowhead-yellow",
              };

              const markerId =
                kind === "better"
                  ? "arrowhead-better"
                  : kind === "reply"
                  ? "arrowhead-reply"
                  : kind === "custom"
                  ? (a.color && colorMarkerMap[a.color]) ?? "arrowhead-custom"
                  : "arrowhead-played";

              const isDashed = a.dashed || kind === "reply";
              const arrowClass = animateArrows && !isDashed ? styles.animatedArrow : undefined;
              const arrowStyle = animateArrows && !isDashed ? ({ "--arrow-len": Math.ceil(dist) } as CSSProperties) : undefined;

              return (
                <line
                  key={`arrow-${idx}-${a.from}-${a.to}`}
                  className={arrowClass}
                  style={arrowStyle}
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={strokeColor}
                  strokeWidth={(kind === "reply" ? 3.5 : 4.5) * arrowWidthScale}
                  strokeDasharray={isDashed ? "6 4" : undefined}
                  strokeLinecap="round"
                  opacity={0.9}
                  markerEnd={`url(#${markerId})`}
                />
              );
            })}
          </svg>
        )}

        {sketch && sketch.from !== sketch.to && (
          <svg className={styles.overlays} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <line
              x1={place(sketch.from).x}
              y1={place(sketch.from).y}
              x2={place(sketch.to).x}
              y2={place(sketch.to).y}
              stroke={sketchColor}
              strokeWidth={4}
              strokeDasharray="6 4"
              strokeLinecap="round"
              opacity={0.6}
            />
          </svg>
        )}

        {onAnnotate && (
          <div
            className={styles.drawLayer}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const from = squareAt(e.clientX, e.clientY);
              if (from === null) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setSketch({ from, to: from });
            }}
            onPointerMove={(e) => {
              if (!sketch) return;
              const to = squareAt(e.clientX, e.clientY);
              if (to !== null && to !== sketch.to) setSketch({ ...sketch, to });
            }}
            onPointerUp={() => {
              if (sketch) onAnnotate(sketch.from, sketch.to);
              setSketch(null);
            }}
            onPointerCancel={() => setSketch(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}

        {children}
      </div>
    </div>
  );
}
