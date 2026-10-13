"use client";

import Link from "next/link";
import { useMemo, useState, type KeyboardEvent } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { MoveList, PlayerCard } from "@/components/game/GamePanels";
import { useMoveSounds } from "@/hooks/useGameSounds";
import { tcLabel, type Variant } from "@/lib/online/protocol";
import { Side, findKing, inCheck, opponent } from "@/lib/xiangqi/engine";
import { describeResult, pieceIds, replayMoves, type EndReason } from "@/lib/xiangqi/game";
import { isHidden, jieqiGameState, jieqiInCheck, layoutFrom } from "@/lib/xiangqi/jieqi";
import type { PositionEval } from "@/lib/xiangqi/analysis";
import play from "@/app/play/play.module.css";
import { AnalysisPanel, type AnalysisUpdateInfo } from "./AnalysisPanel";
import { ReportButton } from "./ReportButton";
import { PositionAnalysisModal } from "@/components/board/PositionAnalysisModal";
import { usePositionAnalysis } from "@/hooks/usePositionAnalysis";
import type { CandidateMoveAnalysis } from "@/lib/xiangqi/position-analysis";
import type { BoardArrow } from "@/components/board/XiangqiBoard";
import styles from "./game.module.css";

export interface ReplayPlayer {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  frame: string;
  before: number;
  after: number;
}

export interface ReplayData {
  id: string;
  variant: Variant;
  minutes: number;
  increment: number;
  rated: boolean;
  tournamentId: string | null;
  setup: unknown;
  winner: Side | null;
  reason: EndReason;
  moves: { from: number; to: number; reveal?: string }[];
  red: ReplayPlayer;
  black: ReplayPlayer;
  endedAt: string;
}

export function GameReplay({
  data,
  viewerId,
  initialAnalysis,
}: {
  data: ReplayData;
  viewerId: string | null;
  initialAnalysis?: (PositionEval | null)[] | null;
}) {
  const jieqi = data.variant === "jieqi";
  const full = useMemo(() => (jieqi ? jieqiGameState(data.moves) : replayMoves(data.moves)), [data.moves, jieqi]);
  // Cờ úp: ván đã xong nên được xem bố cục thật của các quân còn úp.
  const layout = useMemo(() => (jieqi ? layoutFrom(data.setup) : null), [jieqi, data.setup]);
  const [revealAll, setRevealAll] = useState(false);
  const total = full.moves.length;
  const [ply, setPly] = useState(total);
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisUpdateInfo | null>(null);
  const [showPosModal, setShowPosModal] = useState(false);
  const [posArrows, setPosArrows] = useState<BoardArrow[]>([]);
  const [posHighlights, setPosHighlights] = useState<number[]>([]);
  const {
    result: posResult,
    loading: posLoading,
    error: posError,
    analyze: runPosAnalysis,
  } = usePositionAnalysis();
  const go = (p: number) => setPly(Math.max(0, Math.min(total, p)));
  const shown = useMemo(() => full.moves.slice(0, ply), [full, ply]);
  useMoveSounds(shown);

  const mySide: Side | null = viewerId === data.red.id ? "r" : viewerId === data.black.id ? "b" : null;
  const bottom: Side = mySide ?? "r";
  const pos = full.history[ply];
  const lastMove = ply > 0 ? full.moves[ply - 1].move : null;
  const checkSquare = (jieqi ? jieqiInCheck(pos.board, pos.turn) : inCheck(pos.board, pos.turn)) ? findKing(pos.board, pos.turn) : null;
  const board = revealAll && layout ? pos.board.map((p, i) => (isHidden(p) ? (layout[i] ?? p) : p)) : pos.board;
  const result = describeResult({ winner: data.winner, reason: data.reason }, mySide);

  const displayBoard = analysisInfo?.previewBoard ?? board;
  const displayLastMove = analysisInfo?.previewMove ?? lastMove;
  const displayArrows = analysisInfo?.arrows ?? [];
  const displayHighlights = analysisInfo?.highlights ?? [];

  const card = (s: Side) => {
    const p = s === "r" ? data.red : data.black;
    const d = p.after - p.before;
    const ratingText = data.rated ? `Elo ${p.before} → ${p.after} (${d >= 0 ? "+" : "−"}${Math.abs(d)})` : `Elo ${p.before}`;
    return (
      <PlayerCard
        className={s === bottom ? play.me : play.opp}
        name={s === mySide ? `${p.displayName} (Bạn)` : p.displayName}
        subtitle={`${ratingText} · ${s === "r" ? "Đỏ" : "Đen"}`}
        avatar={p.displayName.slice(0, 1).toUpperCase()}
        avatarId={p.avatar}
        frameId={p.frame}
        highlight={s === mySide}
        clock={null}
        clockActive={false}
        clockLow={false}
        captured={shown.filter((m) => m.side === s && m.captured).map((m) => m.captured!)}
      />
    );
  };

  const handleOpenPosAnalysis = () => {
    setShowPosModal(true);
    setPosArrows([]);
    setPosHighlights([]);
    const historyMoves = full.moves.slice(0, ply).map((m) => m.move);
    const historyNotations = full.moves.slice(0, ply).map((m) => m.notation);
    runPosAnalysis(pos.board, pos.turn, historyMoves, historyNotations);
  };

  const handleSelectPosCandidate = (cand: CandidateMoveAnalysis) => {
    setPosArrows([
      {
        from: cand.move.from,
        to: cand.move.to,
        kind: "better",
      },
    ]);
    setPosHighlights([cand.move.from, cand.move.to]);
  };

  const handleSelectPosThreat = () => {
    if (!posResult?.layer3.threatMove) return;
    setPosArrows([
      {
        from: posResult.layer3.threatMove.from,
        to: posResult.layer3.threatMove.to,
        kind: "custom",
        color: "#ef4444",
      },
    ]);
    setPosHighlights(posResult.layer3.dangerPieces.map((p) => p.square));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowLeft: ply - 1, ArrowRight: ply + 1, Home: 0, End: total };
    if (e.key in keys) {
      e.preventDefault();
      go(keys[e.key]);
    }
  };

  const opponentOfViewer = mySide ? (opponent(mySide) === "r" ? data.red : data.black) : null;

  return (
    <main className={play.layout} onKeyDown={onKeyDown}>
      <div className={play.side}>
        {card(opponent(bottom))}
        <div className={`card ${play.status}`} role="status">
          <strong>{result.title}</strong>
          <span className="muted">{result.detail}</span>
          <span className="muted">
            {jieqi ? "Cờ úp · " : ""}{tcLabel(data.minutes, data.increment)} · {data.rated ? "Tính điểm" : "Giao hữu"} ·{" "}
            {new Date(data.endedAt).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" })}
          </span>
        </div>
        {card(bottom)}
      </div>

      <section className={play.center} aria-label="Bàn cờ">
        <XiangqiBoard
          board={displayBoard}
          ids={analysisInfo?.previewBoard ? undefined : pieceIds(full, ply)}
          orientation={bottom}
          lastMove={displayLastMove}
          checkSquare={checkSquare}
          disabled
          arrows={[...displayArrows, ...posArrows]}
          highlights={[...displayHighlights, ...posHighlights]}
        />
      </section>

      <div className={play.side}>
        <div className={`card ${play.panel} ${play.controls}`}>
          <div className={play.panelHead}>
            <h2 className={play.panelTitle}>Xem lại ván</h2>
            <span className="muted">Nước {ply} / {total}</span>
          </div>
          <div className={styles.replayNav} role="group" aria-label="Điều khiển xem lại">
            <button type="button" className="btn" onClick={() => go(0)} disabled={ply === 0} aria-label="Về đầu ván">⏮</button>
            <button type="button" className="btn" onClick={() => go(ply - 1)} disabled={ply === 0} aria-label="Lùi một nước">◀</button>
            <button type="button" className="btn" onClick={() => go(ply + 1)} disabled={ply === total} aria-label="Tiến một nước">▶</button>
            <button type="button" className="btn" onClick={() => go(total)} disabled={ply === total} aria-label="Tới cuối ván">⏭</button>
          </div>
          <MoveList moves={full.moves} current={ply} onSelect={go} />
          {layout && (
            <button type="button" className="btn" aria-pressed={revealAll} onClick={() => setRevealAll((v) => !v)}>
              {revealAll ? "Úp lại các quân chưa lật" : "Lật hết quân úp (xem thế bày thật)"}
            </button>
          )}
          <div className={styles.players}>
            <span>
              Hồ sơ: <Link href={`/u/${data.red.username}`}>{data.red.displayName}</Link> ·{" "}
              <Link href={`/u/${data.black.username}`}>{data.black.displayName}</Link>
            </span>
          </div>
          <div className={styles.replayActions}>
            <button type="button" className="btn" onClick={handleOpenPosAnalysis}>Phân tích hình cờ</button>
            <Link href="/online" className="btn btn-primary">Đấu ván mới</Link>
            {opponentOfViewer && <ReportButton targetId={opponentOfViewer.id} targetName={opponentOfViewer.displayName} gameId={data.id} />}
          </div>
        </div>
        {!jieqi && (
          <AnalysisPanel
            gameId={data.id}
            initialAnalysis={initialAnalysis}
            state={full}
            ply={ply}
            onSelect={go}
            viewer={mySide}
            onAnalysisUpdate={setAnalysisInfo}
          />
        )}
      </div>

      <PositionAnalysisModal
        isOpen={showPosModal}
        onClose={() => {
          setShowPosModal(false);
          setPosArrows([]);
          setPosHighlights([]);
        }}
        analysis={posResult}
        loading={posLoading}
        error={posError}
        onSelectCandidate={handleSelectPosCandidate}
        onSelectThreat={handleSelectPosThreat}
      />
    </main>
  );
}
