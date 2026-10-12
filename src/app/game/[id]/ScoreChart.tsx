"use client";

import { useMemo } from "react";
import { winChance, type MoveReview, type PositionEval } from "@/lib/xiangqi/analysis";
import styles from "./game.module.css";

export interface ScoreChartProps {
  evals: (PositionEval | null)[];
  reviews?: MoveReview[];
  currentPly: number;
  totalMoves: number;
  onSelect: (ply: number) => void;
}

const SVG_W = 600;
const SVG_H = 90;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
const DRAW_H = SVG_H - PAD_TOP - PAD_BOTTOM;
const Y_MID = SVG_H / 2;

export function ScoreChart({
  evals,
  reviews = [],
  currentPly,
  totalMoves,
  onSelect,
}: ScoreChartProps) {
  const n = Math.max(totalMoves, evals.length - 1);

  const { points, linePath, redAreaPath, blackAreaPath, markers } = useMemo(() => {
    if (n <= 0) {
      return { points: [], linePath: "", redAreaPath: "", blackAreaPath: "", markers: [] };
    }

    const pts: { x: number; y: number; wRed: number; ply: number }[] = [];
    let lastWRed = 0.5;

    for (let i = 0; i <= n; i++) {
      const ev = evals[i];
      let wRed = lastWRed;
      if (ev) {
        const turn = i % 2 === 0 ? "r" : "b";
        const redScore = turn === "r" ? ev.score : -ev.score;
        wRed = winChance(redScore);
        lastWRed = wRed;
      }
      const x = (i / n) * SVG_W;
      const y = PAD_TOP + (1 - wRed) * DRAW_H;
      pts.push({ x, y, wRed, ply: i });
    }

    // Tạo đường linePath
    let lp = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      lp += ` L ${pts[i].x} ${pts[i].y}`;
    }

    // Vùng diện tích đỏ (phía trên trục Y_MID) và đen (phía dưới trục Y_MID)
    const rap = `${lp} L ${pts[pts.length - 1].x} ${Y_MID} L ${pts[0].x} ${Y_MID} Z`;

    // Markers cho các nước bị chấm
    const mks: { x: number; y: number; ply: number; cls: string; color: string; radius: number }[] = [];
    const reviewByPly = new Map(reviews.map((r) => [r.ply, r]));

    for (let i = 1; i <= n; i++) {
      const r = reviewByPly.get(i);
      if (!r || !r.cls) continue;
      const pt = pts[i];
      if (!pt) continue;

      let color = "#ef4444";
      let radius = 4;
      if (r.cls === "blunder" || r.cls === "missedWin") {
        color = r.cls === "missedWin" ? "#fb923c" : "#ef4444";
        radius = 4.5;
      } else if (r.cls === "mistake") {
        color = "#eab308";
        radius = 3.5;
      } else if (r.cls === "inaccuracy") {
        color = "#d9a441";
        radius = 2.8;
      } else if (r.cls === "brilliant") {
        color = "#14b8a6";
        radius = 4;
      } else if (r.cls === "only") {
        color = "#c084fc";
        radius = 4;
      }

      mks.push({ x: pt.x, y: pt.y, ply: i, cls: r.cls, color, radius });
    }

    return {
      points: pts,
      linePath: lp,
      redAreaPath: rap,
      blackAreaPath: "",
      markers: mks,
    };
  }, [evals, reviews, n]);

  if (n <= 0) return null;

  const currentX = (Math.max(0, Math.min(n, currentPly)) / n) * SVG_W;
  const currentPt = points[Math.max(0, Math.min(n, currentPly))] ?? { y: Y_MID, wRed: 0.5 };
  const redWinPct = Math.round(currentPt.wRed * 100);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const selectedPly = Math.round(ratio * n);
    onSelect(selectedPly);
  };

  return (
    <div className={styles.scoreChartContainer}>
      <div className={styles.scoreChartHeader}>
        <span className="muted">Biểu đồ thế trận</span>
        <span className={styles.scoreChartBadge}>
          {redWinPct >= 50 ? `Đỏ thắng ${redWinPct}%` : `Đen thắng ${100 - redWinPct}%`}
        </span>
      </div>

      <div className={styles.scoreChartSvgWrapper}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className={styles.scoreChartSvg}
          onClick={handleClick}
          role="img"
          aria-label="Biểu đồ điểm thế trận cả ván. Bấm vào điểm bất kỳ để chuyển nước."
        >
          <defs>
            <linearGradient id="scoreRedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e5483e" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#e5483e" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="scoreBlackGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Đường cân bằng 50% */}
          <line
            x1={0}
            y1={Y_MID}
            x2={SVG_W}
            y2={Y_MID}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeDasharray="4 4"
            strokeWidth={1.2}
          />

          {/* Vùng diện tích */}
          <path d={redAreaPath} fill="url(#scoreRedGradient)" />

          {/* Đường biểu diễn điểm thế trận */}
          <path d={linePath} fill="none" stroke="#d9a441" strokeWidth={2.4} strokeLinecap="round" />

          {/* Các điểm đánh dấu nước hớ / nước đặc biệt */}
          {markers.map((m) => (
            <circle
              key={`m-${m.ply}`}
              cx={m.x}
              cy={m.y}
              r={m.radius}
              fill={m.color}
              stroke="#1a1a24"
              strokeWidth={1.5}
            />
          ))}

          {/* Vạch chỉ số hiện tại (current ply) */}
          <line
            x1={currentX}
            y1={0}
            x2={currentX}
            y2={SVG_H}
            stroke="#ffffff"
            strokeWidth={1.8}
            strokeDasharray="3 3"
            opacity={0.85}
          />
          <circle
            cx={currentX}
            cy={currentPt.y}
            r={4.5}
            fill="#ffffff"
            stroke="#d9a441"
            strokeWidth={2}
          />
        </svg>
      </div>

      <div className={styles.scoreChartLegend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#ef4444" }} /> Nước hớ
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#fb923c" }} /> Bỏ lỡ thắng
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#eab308" }} /> Nước kém
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#14b8a6" }} /> Nước hay
        </span>
      </div>
    </div>
  );
}
