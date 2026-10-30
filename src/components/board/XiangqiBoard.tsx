"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useSession } from "@/components/session/SessionProvider";
import { boardSkin, pieceSkin } from "@/lib/skins";
import { Board, Move, Side, colOf, rowOf, sideOf, typeOf } from "@/lib/xiangqi/engine";
import { PIECE_CHAR, PIECE_NAME } from "@/lib/xiangqi/notation";
import styles from "./XiangqiBoard.module.css";

// Hình học bàn cờ trong hệ tọa độ SVG; mọi vị trí HTML được quy ra % để bàn cờ co giãn.
const CELL = 58;
const PIECE = 52;
const TARGET = 44;
const HAN_FONT = 27;
/** Kéo quá khoảng này (px) mới tính là kéo thả, nhỏ hơn là bấm. */
const DRAG_THRESHOLD = 6;

function makeGeometry(padX: number, padY: number, labelY: number) {
  const W = 8 * CELL + 2 * padX;
  const H = 9 * CELL + 2 * padY;
  const px = (dc: number) => padX + dc * CELL;
  const py = (dr: number) => padY + dr * CELL;

  let grid = "";
  for (let r = 0; r < 10; r++) grid += `M${px(0)} ${py(r)}H${px(8)}`;
  for (let c = 0; c < 9; c++) {
    grid += c === 0 || c === 8
      ? `M${px(c)} ${py(0)}V${py(9)}`
      : `M${px(c)} ${py(0)}V${py(4)}M${px(c)} ${py(5)}V${py(9)}`;
  }
  grid += `M${px(3)} ${py(0)}L${px(5)} ${py(2)}M${px(5)} ${py(0)}L${px(3)} ${py(2)}`;
  grid += `M${px(3)} ${py(7)}L${px(5)} ${py(9)}M${px(5)} ${py(7)}L${px(3)} ${py(9)}`;

  // Dấu góc ở vị trí pháo và tốt.
  const spots: [number, number][] = [[2, 1], [2, 7], [7, 1], [7, 7]];
  for (const r of [3, 6]) for (const c of [0, 2, 4, 6, 8]) spots.push([r, c]);
  const g = 4;
  const l = 10;
  let marks = "";
  for (const [r, c] of spots) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue;
      const x = px(c);
      const y = py(r);
      marks += `M${x + sx * (g + l)} ${y + sy * g}H${x + sx * g}V${y + sy * (g + l)}`;
    }
  }

  return {
    W, H, padX, padY, labelY, px, py, grid, marks,
    pctX: (x: number) => `${(x / W) * 100}%`,
    pctY: (y: number) => `${(y / H) * 100}%`,
    // Kích thước phần tử HTML tính theo bề rộng bàn cờ, để co giãn cùng SVG.
    vars: {
      aspectRatio: `${W} / ${H}`,
      "--piece-size": `${(PIECE / W) * 100}%`,
      "--target-size": `${(TARGET / W) * 100}%`,
      "--han-size": `${(HAN_FONT / W) * 100}cqw`,
    } as CSSProperties,
  };
}

// Bàn thường: lề trên dưới rộng hơn hai bên để chừa chỗ cho hàng số cột.
const STANDARD = makeGeometry(40, 54, 15);
// Bàn Ziga (sân khấu): lưới sát mép như bàn zigavn, số cột nhỏ nằm trong lề.
const ZIGA = makeGeometry(31, 45, 11);

/** Quân úp của cờ úp: "H" (đỏ) và "h" (đen). */
const isHidden = (p: string) => p === "H" || p === "h";

export const ZIGA_PIECE_CHAR: Record<string, string> = {
  K: "帥", A: "仕", B: "相", N: "傌", R: "俥", C: "砲", P: "兵",
  k: "將", a: "士", b: "象", n: "馬", r: "車", c: "包", p: "卒",
  H: "暗", h: "暗",
};

export interface BoardArrow {
  from: number;
  to: number;
  kind?: "played" | "better" | "reply" | "custom";
  color?: string;
  dashed?: boolean;
  label?: string | number;
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
  /** Màu nét phác thảo mũi tên theo ô bắt đầu; bỏ trống thì quân đỏ xanh lá, quân đen đỏ, ô trống theo `sketchColor`. */
  sketchColorAt?: (from: number) => string;
  /** Tùy chọn độ phóng to bề dày mũi tên và đầu mũi tên (cho màn hình điện thoại / livestream sân khấu). */
  arrowWidthScale?: number;
  /** Bật hiệu ứng vẽ từ từ của mũi tên (stroke-dashoffset animation). */
  animateArrows?: boolean;
  /** Lớp CSS gắn ngoài viền bàn cờ để ghi đè kích thước/bố cục nếu cần. */
  className?: string;
  onAnnotate?: (from: number, to: number) => void;
  /** Chế độ giao diện Ziga giống bàn cờ cờ tướng Ziga (quân cờ ngà gỗ, watermark sông, góc xanh neon). */
  variant?: "standard" | "ziga";
  /** Chữ watermark giữa sông thay cho 楚河漢界 (mặc định 'Cờ Ziga' khi variant='ziga'). */
  riverWatermark?: string;
  /** Bộ chữ quân: mặc định theo `variant`; sân khấu dùng "standard" để quân giống trang Tường thuật. */
  pieceSet?: "standard" | "ziga";
  /** Mở màn ván: lưới hiện dần rồi quân rơi vào chỗ lần lượt từ hàng cuối mỗi bên (bật lại để chạy lại). */
  intro?: boolean;
  /** Hiệu ứng chiếu tướng: lằn sáng từ quân chiếu tới Tướng và sóng đỏ quanh Tướng; đổi `key` để chạy lại. */
  checkFx?: { key: string; from: number[]; king: number } | null;
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
  sketchColorAt,
  arrowWidthScale = 1,
  animateArrows = false,
  className,
  onAnnotate,
  variant = "standard",
  riverWatermark,
  pieceSet,
  intro = false,
  checkFx = null,
}: XiangqiBoardProps) {
  const { user } = useSession();
  const boardRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ square: number; x: number; y: number; id: number } | null>(null);
  const handledByPointer = useRef(false);
  const [drag, setDrag] = useState<{ square: number; dx: number; dy: number } | null>(null);
  const [sketch, setSketch] = useState<{ from: number; to: number } | null>(null);

  const isZiga = variant === "ziga";
  const charMap = (pieceSet ?? variant) === "ziga" ? ZIGA_PIECE_CHAR : PIECE_CHAR;
  const geo = isZiga ? ZIGA : STANDARD;
  const { W, H, px, py, pctX, pctY } = geo;
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
      const dc = Math.round((((clientX - rect.left) / rect.width) * W - geo.padX) / CELL);
      const dr = Math.round((((clientY - rect.top) / rect.height) * H - geo.padY) / CELL);
      if (dc < 0 || dc > 8 || dr < 0 || dr > 9) return null;
      return (flip ? 9 - dr : dr) * 9 + (flip ? 8 - dc : dc);
    },
    [flip, geo, W, H],
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
    <div className={`${styles.rim} ${isZiga ? styles.zigaBoard : ""} ${className ?? ""}`.trim()} style={theme}>
      <div
        ref={boardRef}
        className={styles.board}
        style={geo.vars}
        data-disabled={disabled || undefined}
        data-intro={intro || undefined}
      >
        <svg className={styles.lines} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <rect x={geo.padX - 7} y={geo.padY - 7} width={8 * CELL + 14} height={9 * CELL + 14} className={styles.frame} />
          <path d={geo.grid} className={styles.grid} />
          <path d={geo.marks} className={styles.grid} />
          {isZiga || riverWatermark ? (
            <text
              x={px(4)}
              y={py(4.5) + 3}
              className={isZiga ? styles.zigaRiver : `${styles.zigaRiver} ${styles.skinRiver}`}
            >
              {riverWatermark ?? "Cờ Ziga"}
            </text>
          ) : (
            <>
              <text x={px(2)} y={py(4.5)} className={styles.river}>楚 河</text>
              <text x={px(6)} y={py(4.5)} className={styles.river}>漢 界</text>
            </>
          )}
          {/* Số cột: hàng trên theo cách đếm của bên trên, hàng dưới theo bên dưới (đều đếm từ phải sang). */}
          {Array.from({ length: 9 }, (_, dc) => (
            <g key={dc} className={styles.label}>
              <text x={px(dc)} y={geo.labelY}>{dc + 1}</text>
              <text x={px(dc)} y={H - geo.labelY}>{9 - dc}</text>
            </g>
          ))}
        </svg>

        {lastMove && <span className={styles.lastFrom} style={at(lastMove.from)} aria-hidden="true" />}
        {/* Khung 4 góc xanh quanh quân vừa đi tới, dễ nhận ra nước vừa đi trên livestream. */}
        {lastMove && <span className={styles.lastCorners} style={at(lastMove.to)} aria-hidden="true" />}
        {/* Khung vòng xanh neon Ziga quanh quân đang được chọn */}
        {isZiga && selected !== null && <span className={styles.selectedCorners} style={at(selected)} aria-hidden="true" />}

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
          const style: CSSProperties = dragging
            ? { ...at(i), transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.08)` }
            : at(i);
          if (intro) {
            // Hàng cuối mỗi bên rơi trước, tiến dần vào sông; trong một hàng thì từ giữa ra hai cánh.
            const { x, y } = place(i);
            const dr = Math.round((y - geo.padY) / CELL);
            const dc = Math.round((x - geo.padX) / CELL);
            (style as Record<string, string>)["--intro-d"] = `${Math.min(dr, 9 - dr) * 110 + Math.abs(dc - 4) * 30}ms`;
          }
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
              <span className={styles.face}>{hidden ? "" : charMap[p]}</span>
            </button>
          );
        })}

        {targets.filter((t) => !board[t]).map((t) => (
          <button
            key={`t${t}`}
            type="button"
            className={`${styles.target} ${isZiga ? styles.zigaTarget : ""}`.trim()}
            style={at(t)}
            onClick={() => select(t)}
            onDragStart={(e) => e.preventDefault()}
            data-square={t}
            aria-label="Đi tới ô này"
          >
            {isZiga ? <span className={styles.targetCorners} /> : <span />}
          </button>
        ))}

        {(arrows.length > 0 || highlights.length > 0) && (
          <svg className={styles.overlays} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
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
              const strokeWidth = (kind === "reply" ? 3.5 : 4.5) * arrowWidthScale;

              // Thân bắt đầu gần tâm quân đi, mũi chạm vào quân đích (ô trống thì gần tới giao điểm). Đầu mũi tên tự vẽ và
              // co theo độ dài: nước 1 ô mà giữ đầu cỡ chuẩn thì đầu che gần hết thân, trông cụt.
              const startGap = dist <= CELL * 1.5 ? CELL * 0.15 : 16;
              const tipGap = board[a.to] ? CELL * 0.3 : CELL * 0.1;
              const headLen = Math.min(5.4 * strokeWidth, (dist - startGap - tipGap) * 0.45);
              const headHalf = Math.max(headLen * 0.4, strokeWidth * 1.1);
              const startX = p1.x + ux * startGap;
              const startY = p1.y + uy * startGap;
              const tipX = p2.x - ux * tipGap;
              const tipY = p2.y - uy * tipGap;
              const baseX = tipX - ux * headLen;
              const baseY = tipY - uy * headLen;
              // Thân lẹm vào đầu một chút để không hở khe giữa nét tròn và đáy tam giác.
              const endX = baseX + ux * Math.min(headLen * 0.3, strokeWidth);
              const endY = baseY + uy * Math.min(headLen * 0.3, strokeWidth);
              const head = `M ${tipX} ${tipY} L ${baseX - uy * headHalf} ${baseY + ux * headHalf} L ${baseX + uy * headHalf} ${baseY - ux * headHalf} Z`;

              const isDashed = a.dashed || kind === "reply";
              const arrowClass = animateArrows && !isDashed ? styles.animatedArrow : undefined;
              const arrowStyle = animateArrows && !isDashed ? ({ "--arrow-len": Math.ceil(dist) } as CSSProperties) : undefined;

              const badgeR = 10.5 * Math.max(1, arrowWidthScale * 0.85);
              // Mũi tên ngắn (≤ 1,5 ô): số thứ tự đặt lệch sang bên cạnh thân, không thì che mất cả mũi tên.
              const badgeSide = dist <= CELL * 1.5 ? badgeR + strokeWidth : 0;
              const badgeX = (startX + baseX) / 2 - uy * badgeSide;
              const badgeY = (startY + baseY) / 2 + ux * badgeSide;

              return (
                <g key={`arrow-${idx}-${a.from}-${a.to}`} opacity={0.9}>
                  <line
                    className={arrowClass}
                    style={arrowStyle}
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isDashed ? "6 4" : undefined}
                    strokeLinecap="round"
                  />
                  <path d={head} fill={strokeColor} strokeLinejoin="round" />
                  {a.label !== undefined && a.label !== null && a.label !== "" && (
                    <g pointerEvents="none">
                      <circle
                        cx={badgeX}
                        cy={badgeY}
                        r={badgeR}
                        fill={strokeColor}
                        stroke="#ffffff"
                        strokeWidth={1.8 * (arrowWidthScale >= 1.5 ? 1.3 : 1)}
                        filter="drop-shadow(0 1px 3px rgba(0, 0, 0, 0.55))"
                      />
                      <text
                        x={badgeX}
                        y={badgeY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#ffffff"
                        fontSize={11.5 * Math.max(1, arrowWidthScale * 0.85)}
                        fontWeight="800"
                        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
                      >
                        {a.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {sketch && sketch.from !== sketch.to && (
          <svg className={styles.overlays} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            {(() => {
              const p1 = place(sketch.from);
              const p2 = place(sketch.to);
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const pieceAtStart = board[sketch.from];
              const activeColor = sketchColorAt
                ? sketchColorAt(sketch.from)
                : pieceAtStart
                ? sideOf(pieceAtStart) === "r"
                  ? "#22c55e"
                  : "#ef4444"
                : sketchColor;
              const badgeX = p1.x + dx * 0.45;
              const badgeY = p1.y + dy * 0.45;
              const badgeR = 10.5 * Math.max(1, arrowWidthScale * 0.85);
              const nextNumber = arrows.length + 1;

              return (
                <g pointerEvents="none">
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={activeColor}
                    strokeWidth={4 * arrowWidthScale}
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    opacity={0.75}
                  />
                  <circle
                    cx={badgeX}
                    cy={badgeY}
                    r={badgeR}
                    fill={activeColor}
                    stroke="#ffffff"
                    strokeWidth={1.8}
                    opacity={0.9}
                  />
                  <text
                    x={badgeX}
                    y={badgeY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffff"
                    fontSize={11.5 * Math.max(1, arrowWidthScale * 0.85)}
                    fontWeight="800"
                    fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
                    opacity={0.95}
                  >
                    {nextNumber}
                  </text>
                </g>
              );
            })()}
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

        {checkFx && (
          <svg key={checkFx.key} className={styles.checkFx} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            {checkFx.from.map((sq) => {
              const a = place(sq);
              const k = place(checkFx.king);
              return (
                <g key={sq}>
                  <line x1={a.x} y1={a.y} x2={k.x} y2={k.y} pathLength={1} className={styles.checkBeamGlow} />
                  <line x1={a.x} y1={a.y} x2={k.x} y2={k.y} pathLength={1} className={styles.checkBeam} />
                </g>
              );
            })}
            {[0, 1, 2].map((n) => (
              <circle
                key={n}
                cx={place(checkFx.king).x}
                cy={place(checkFx.king).y}
                r={CELL * 0.5}
                className={styles.checkWave}
                style={{ animationDelay: `${300 + n * 420}ms` }}
              />
            ))}
          </svg>
        )}

        {children}
      </div>
    </div>
  );
}
