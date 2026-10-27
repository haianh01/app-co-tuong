"use client";

import { ReactNode, useEffect, useMemo, useReducer, useState } from "react";
import { AnalysisPanel, type AnalysisUpdateInfo } from "@/app/game/[id]/AnalysisPanel";
import { XiangqiBoard, type BoardArrow } from "@/components/board/XiangqiBoard";
import { MoveList, PlayerCard, ResultOverlay } from "@/components/game/GamePanels";
import { PositionAnalysisModal } from "@/components/board/PositionAnalysisModal";
import { usePositionAnalysis } from "@/hooks/usePositionAnalysis";
import type { CandidateMoveAnalysis } from "@/lib/xiangqi/position-analysis";
import { useSession } from "@/components/session/SessionProvider";
import { useEngine } from "@/hooks/useEngine";
import { useMoveSounds, useResultSound } from "@/hooks/useGameSounds";
import { formatClock, useClock } from "@/hooks/useClock";
import { AI_LEVELS, AiLevel } from "@/lib/xiangqi/ai";
import { Move, findKing, inCheck, legalMovesFrom, opponent, sideOf, toFen } from "@/lib/xiangqi/engine";
import { GameResult, currentPosition, describeResult, forbiddenMoves, gameReducer, newGame, pieceIds, timeoutResult } from "@/lib/xiangqi/game";
import { LiveCoach } from "./LiveCoach";
import { PlaySettings, TIME_OPTIONS, settingsHref } from "./settings";
import { ZHAO_LESSONS } from "@/lib/xiangqi/zhao48-lessons";
import { ZHAO_ENDGAME_LESSONS } from "@/lib/xiangqi/zhao48-endgame-lessons";
import { ZHAO_OPENING_LESSONS } from "@/lib/xiangqi/zhao48-opening-lessons";
import styles from "./play.module.css";

const LEVELS = Object.entries(AI_LEVELS).map(([k, v]) => ({ level: Number(k) as AiLevel, label: v.label }));

export function PlayClient({ initial }: { initial: PlaySettings }) {
  const [settings, setSettings] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [session, setSession] = useState(0);
  // cacheComponents giữ trang trong <Activity> ẩn thay vì gỡ: quay lại /play với tham số khác (vd. "Luyện tập cờ"
  // nạp thế bài giảng) thì state cũ vẫn còn. Tham số URL đổi thì bày ván mới theo tham số đó.
  const initialHref = settingsHref(initial);
  const [appliedHref, setAppliedHref] = useState(initialHref);
  if (appliedHref !== initialHref) {
    setAppliedHref(initialHref);
    setSettings(initial);
    setDraft(initial);
    setSession((s) => s + 1);
  }

  const startNew = () => {
    setSettings(draft);
    setSession((s) => s + 1);
    setAppliedHref(settingsHref(draft));
    window.history.replaceState(null, "", settingsHref(draft));
  };

  return (
    <GameSession
      key={session}
      settings={settings}
      onNewGame={startNew}
      setup={
        <div className={`card ${styles.panel}`}>
          <h2 className={styles.panelTitle}>Thiết lập ván mới</h2>
          <fieldset className={styles.field}>
            <legend>Cấp độ máy</legend>
            <div className={styles.segments}>
              {LEVELS.map((l) => (
                <button
                  key={l.level}
                  type="button"
                  className={styles.segment}
                  aria-pressed={draft.level === l.level}
                  onClick={() => setDraft({ ...draft, level: l.level })}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.field}>
            <legend>Bạn cầm quân</legend>
            <div className={styles.segments}>
              <button type="button" className={styles.segment} aria-pressed={draft.side === "r"} onClick={() => setDraft({ ...draft, side: "r" })}>Đỏ (đi trước)</button>
              <button type="button" className={styles.segment} aria-pressed={draft.side === "b"} onClick={() => setDraft({ ...draft, side: "b" })}>Đen</button>
            </div>
          </fieldset>
          <fieldset className={styles.field}>
            <legend>Thời gian mỗi bên</legend>
            <div className={styles.segments}>
              {TIME_OPTIONS.map((t) => (
                <button key={t.minutes} type="button" className={styles.segment} aria-pressed={draft.minutes === t.minutes} onClick={() => setDraft({ ...draft, minutes: t.minutes })}>
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>
          <button type="button" className="btn btn-primary" onClick={startNew}>Bắt đầu ván mới</button>
        </div>
      }
    />
  );
}

function GameSession({ settings, onNewGame, setup }: { settings: PlaySettings; onNewGame: () => void; setup: ReactNode }) {
  const { level, side: player, minutes } = settings;
  const ai = opponent(player);
  const [state, dispatch] = useReducer(gameReducer, undefined, () => newGame(settings.fen));
  // Thế nạp từ bài giảng Triệu Hâm Hâm (?fen=&lesson=&book=)
  const lessonCard = settings.fen && settings.lesson
    ? (settings.book === "endgame"
        ? ZHAO_ENDGAME_LESSONS
        : settings.book === "opening"
        ? ZHAO_OPENING_LESSONS
        : ZHAO_LESSONS)[settings.lesson]
    : undefined;
  const [selection, setSelection] = useState<{ ply: number; square: number } | null>(null);
  const [hint, setHint] = useState<{ ply: number; move: Move } | null>(null);
  // Hết ván: nửa nước đang xem lại khi bấm vào nước bị AI chấm (null = thế cuối).
  const [review, setReview] = useState<number | null>(null);
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisUpdateInfo | null>(null);
  const [coach, setCoach] = useState(true);
  const [overlayClosed, setOverlayClosed] = useState(false);
  const [showPosAnalysis, setShowPosAnalysis] = useState(false);
  const [posArrows, setPosArrows] = useState<BoardArrow[]>([]);
  const [posHighlights, setPosHighlights] = useState<number[]>([]);
  const {
    result: posResult,
    loading: posLoading,
    error: posError,
    analyze: runPosAnalysis,
  } = usePositionAnalysis();
  const think = useEngine();

  const pos = currentPosition(state);
  const ply = state.moves.length;
  const clock = useClock(minutes * 60_000, pos.turn, !!state.result);
  const result: GameResult | null =
    state.result ?? (clock.flagged ? timeoutResult(pos.board, clock.flagged) : null);
  const { user } = useSession();
  useMoveSounds(state.moves);
  useResultSound(result, player);

  const aiToMove = !result && pos.turn === ai;
  const fen = toFen(pos);
  // Nước đi xong sẽ phạm luật chiếu mãi / đuổi bắt mãi: máy và gợi ý phải tránh.
  const avoidKey = useMemo(() => JSON.stringify(forbiddenMoves(state)), [state]);

  useEffect(() => {
    if (!aiToMove) return;
    let cancelled = false;
    // Giữ nhịp tối thiểu để nước đi của máy không xuất hiện "giật".
    const minDelay = new Promise((resolve) => setTimeout(resolve, 450));
    const avoid: Move[] = JSON.parse(avoidKey);
    Promise.all([think(fen, level, avoid.length ? { avoid } : undefined), minDelay])
      .then(([res]) => {
        if (!cancelled && res.move) dispatch({ type: "move", move: res.move });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [aiToMove, fen, level, think, avoidKey]);

  const selected = selection?.ply === ply ? selection.square : null;
  const targets = selected !== null ? legalMovesFrom(pos, selected).map((m) => m.to) : [];
  const activeHint = hint?.ply === ply ? hint.move : null;
  const viewPly = result && review !== null ? review : ply;
  const reviewing = viewPly !== ply;
  const viewBoard = state.history[viewPly].board;
  const lastMove = state.moves[viewPly - 1]?.move ?? null;
  const displayBoard = analysisInfo?.previewBoard ?? viewBoard;
  const displayLastMove = analysisInfo?.previewMove ?? lastMove;
  const displayArrows = analysisInfo?.arrows ?? [];
  const displayHighlights = analysisInfo?.highlights ?? [];
  const viewTurn = state.history[viewPly].turn;
  const checkSquare = inCheck(displayBoard, viewTurn) ? findKing(displayBoard, viewTurn) : null;
  const canAct = !result && pos.turn === player;
  // Đi lại về lượt của mình: lùi 2 nửa nước nếu máy đã đáp, 1 nửa nước nếu máy chưa đi.
  const undoPlies = pos.turn === player ? (ply >= 2 ? 2 : 0) : ply >= 1 ? 1 : 0;
  const canUndo = !clock.flagged && undoPlies > 0;

  const onSquareClick = (i: number) => {
    if (!canAct) return;
    const p = pos.board[i];
    if (p && sideOf(p) === player) {
      setSelection(selected === i ? null : { ply, square: i });
      return;
    }
    if (selected !== null && targets.includes(i)) dispatch({ type: "move", move: { from: selected, to: i } });
    setSelection(null);
  };

  const undo = () => {
    if (!canUndo) return;
    setReview(null);
    setAnalysisInfo(null);
    setOverlayClosed(false);
    dispatch({ type: "undo", plies: undoPlies });
  };

  const askHint = () => {
    if (!canAct) return;
    const atPly = ply;
    const avoid: Move[] = JSON.parse(avoidKey);
    // Luyện thế từ bài giảng: gợi ý dùng cấp mạnh nhất (Pikafish 1,5 giây) để người học thấy nước chuẩn
    const hintLevel: AiLevel = lessonCard ? 5 : 4;
    think(fen, hintLevel, avoid.length ? { avoid } : undefined).then((res) => {
      if (res.move) {
        setHint({ ply: atPly, move: res.move });
        setSelection({ ply: atPly, square: res.move.from });
      }
    }).catch(() => {});
  };

  const handleOpenPosAnalysis = () => {
    setShowPosAnalysis(true);
    setPosArrows([]);
    setPosHighlights([]);
    const historyMoves = state.moves.slice(0, viewPly).map((m) => m.move);
    const historyNotations = state.moves.slice(0, viewPly).map((m) => m.notation);
    runPosAnalysis(viewBoard, viewTurn, historyMoves, historyNotations);
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

  const capturedBy = (s: "r" | "b") => state.moves.filter((m) => m.side === s && m.captured).map((m) => m.captured!);
  const timeOf = (s: "r" | "b") => (clock.limited ? formatClock(clock.time[s]) : null);
  const lowTime = (s: "r" | "b") => clock.limited && clock.time[s] < 60_000;
  const outcomeText = result ? describeResult(result, player) : null;
  const status = result
    ? outcomeText!.title
    : aiToMove
      ? "Máy đang suy nghĩ…"
      : checkSquare !== null
        ? "Bạn đang bị chiếu!"
        : "Đến lượt bạn";

  // Desktop: 3 cột. Màn hình hẹp: các cột "tan" ra (display: contents) và xếp lại bằng `order`
  // thành: đối thủ → bàn cờ → bạn → trạng thái → điều khiển → thiết lập.
  return (
    <main className={styles.layout}>
      <div className={styles.side}>
        <PlayerCard
          className={styles.opp}
          name={`Máy · ${AI_LEVELS[level].label}`}
          subtitle={`Cầm quân ${ai === "r" ? "Đỏ" : "Đen"}`}
          avatar="機"
          avatarHan
          clock={timeOf(ai)}
          clockActive={clock.running === ai}
          clockLow={lowTime(ai)}
          captured={capturedBy(ai)}
        />
        <div className={`card ${styles.status}`} role="status">
          {lessonCard && (
            <div className={styles.lessonBanner}>
              <strong>
                📖 {settings.book === "endgame" ? "Tàn cuộc" : settings.book === "opening" ? "Khai cuộc" : "Trung cuộc"} · Bài {settings.lesson}: {lessonCard.title}
              </strong>
              <span>Thế cờ từ ván đại sư • Kỳ lý Triệu Hâm Hâm</span>
            </div>
          )}
          <strong>{status}</strong>
          {checkSquare !== null && !result && <span className={styles.checkSeal}>將軍</span>}
          {!result && <span className="muted">Bấm vào quân của bạn rồi bấm điểm xanh để đi.</span>}
        </div>
        <PlayerCard
          className={styles.me}
          name="Bạn"
          subtitle={`Cầm quân ${player === "r" ? "Đỏ" : "Đen"}`}
          avatar="我"
          avatarId={user ? user.avatar : undefined}
          frameId={user ? user.frame : undefined}
          avatarHan
          highlight
          clock={timeOf(player)}
          clockActive={clock.running === player}
          clockLow={lowTime(player)}
          captured={capturedBy(player)}
        />
      </div>

      <section className={styles.center} aria-label="Bàn cờ">
        <XiangqiBoard
          board={displayBoard}
          ids={reviewing || analysisInfo?.previewBoard ? undefined : pieceIds(state)}
          orientation={player}
          selected={selected}
          targets={targets}
          lastMove={displayLastMove}
          checkSquare={checkSquare}
          hintSquare={activeHint?.from ?? null}
          disabled={!canAct}
          onSquareClick={onSquareClick}
          arrows={[...displayArrows, ...posArrows]}
          highlights={[...displayHighlights, ...posHighlights]}
        >
          {outcomeText && !reviewing && !overlayClosed && (
            <ResultOverlay seal={outcomeText.seal} title={outcomeText.title} detail={outcomeText.detail}>
              <button type="button" className="btn" onClick={() => setOverlayClosed(true)}>Xem bàn cờ</button>
              {canUndo && <button type="button" className="btn" onClick={undo}>Đi lại</button>}
              <button type="button" className="btn btn-primary" onClick={onNewGame}>Ván mới</button>
            </ResultOverlay>
          )}
        </XiangqiBoard>
      </section>

      <div className={styles.side}>
        <div className={styles.review}>
          {coach && !result && <LiveCoach state={state} player={player} />}
          {result && state.moves.length > 0 && (
            <AnalysisPanel
              state={state}
              ply={viewPly}
              onSelect={setReview}
              viewer={player}
              onAnalysisUpdate={setAnalysisInfo}
            />
          )}
          {reviewing && <button type="button" className="btn" onClick={() => setReview(null)}>Về thế cuối ván</button>}
        </div>
        <div className={`card ${styles.panel} ${styles.controls}`}>
          <div className={styles.actions}>
            <button type="button" className="btn" onClick={undo} disabled={!canUndo}>Đi lại</button>
            <button type="button" className="btn" onClick={askHint} disabled={!canAct}>Gợi ý</button>
            <button type="button" className="btn" onClick={handleOpenPosAnalysis}>Phân tích hình cờ</button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!!result}
              onClick={() => dispatch({ type: "end", result: { winner: ai, reason: "resign" } })}
            >
              Xin thua
            </button>
            <button type="button" className="btn btn-primary" onClick={onNewGame}>Ván mới</button>
          </div>
          <label className={styles.coachToggle}>
            <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} />
            Phân tích từng nước khi đang đánh
          </label>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Biên bản</h2>
            <span className="muted">{ply} nửa nước</span>
          </div>
          <MoveList moves={state.moves} />
        </div>
        <div className={styles.setup}>{setup}</div>
      </div>

      <PositionAnalysisModal
        isOpen={showPosAnalysis}
        onClose={() => {
          setShowPosAnalysis(false);
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
