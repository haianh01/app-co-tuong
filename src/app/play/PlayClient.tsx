"use client";

import { ReactNode, useEffect, useMemo, useReducer, useState } from "react";
import { AnalysisPanel } from "@/app/game/[id]/AnalysisPanel";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { MoveList, PlayerCard, ResultOverlay } from "@/components/game/GamePanels";
import { useSession } from "@/components/session/SessionProvider";
import { useAiWorker } from "@/hooks/useAiWorker";
import { useMoveSounds, useResultSound } from "@/hooks/useGameSounds";
import { formatClock, useClock } from "@/hooks/useClock";
import { AI_LEVELS, AiLevel } from "@/lib/xiangqi/ai";
import { Move, findKing, inCheck, legalMovesFrom, opponent, sideOf, toFen } from "@/lib/xiangqi/engine";
import { GameResult, currentPosition, describeResult, forbiddenMoves, gameReducer, newGame, pieceIds, timeoutResult } from "@/lib/xiangqi/game";
import { LiveCoach } from "./LiveCoach";
import { PlaySettings, TIME_OPTIONS, settingsHref } from "./settings";
import styles from "./play.module.css";

const LEVELS = Object.entries(AI_LEVELS).map(([k, v]) => ({ level: Number(k) as AiLevel, label: v.label }));

export function PlayClient({ initial }: { initial: PlaySettings }) {
  const [settings, setSettings] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [session, setSession] = useState(0);

  const startNew = () => {
    setSettings(draft);
    setSession((s) => s + 1);
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
  const [state, dispatch] = useReducer(gameReducer, undefined, () => newGame());
  const [selection, setSelection] = useState<{ ply: number; square: number } | null>(null);
  const [hint, setHint] = useState<{ ply: number; move: Move } | null>(null);
  // Hết ván: nửa nước đang xem lại khi bấm vào nước bị AI chấm (null = thế cuối).
  const [review, setReview] = useState<number | null>(null);
  const [coach, setCoach] = useState(true);
  const think = useAiWorker();

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
  const viewTurn = state.history[viewPly].turn;
  const checkSquare = inCheck(viewBoard, viewTurn) ? findKing(viewBoard, viewTurn) : null;
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
    dispatch({ type: "undo", plies: undoPlies });
  };

  const askHint = () => {
    if (!canAct) return;
    const atPly = ply;
    const avoid: Move[] = JSON.parse(avoidKey);
    think(fen, 4, avoid.length ? { avoid } : undefined).then((res) => {
      if (res.move) {
        setHint({ ply: atPly, move: res.move });
        setSelection({ ply: atPly, square: res.move.from });
      }
    }).catch(() => {});
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
          board={viewBoard}
          ids={reviewing ? undefined : pieceIds(state)}
          orientation={player}
          selected={selected}
          targets={targets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          hintSquare={activeHint?.from ?? null}
          disabled={!canAct}
          onSquareClick={onSquareClick}
        >
          {outcomeText && !reviewing && (
            <ResultOverlay seal={outcomeText.seal} title={outcomeText.title} detail={outcomeText.detail}>
              {canUndo && <button type="button" className="btn" onClick={undo}>Đi lại</button>}
              <button type="button" className="btn btn-primary" onClick={onNewGame}>Ván mới</button>
            </ResultOverlay>
          )}
        </XiangqiBoard>
      </section>

      <div className={styles.side}>
        <div className={`card ${styles.panel} ${styles.controls}`}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Biên bản</h2>
            <span className="muted">{ply} nửa nước</span>
          </div>
          <MoveList moves={state.moves} />
          <div className={styles.actions}>
            <button type="button" className="btn" onClick={undo} disabled={!canUndo}>Đi lại</button>
            <button type="button" className="btn" onClick={askHint} disabled={!canAct}>Gợi ý</button>
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
        </div>
        {coach && !result && <LiveCoach state={state} player={player} />}
        {result && state.moves.length > 0 && (
          <AnalysisPanel state={state} ply={viewPly} onSelect={setReview} viewer={player} />
        )}
        {reviewing && <button type="button" className="btn" onClick={() => setReview(null)}>Về thế cuối ván</button>}
        <div className={styles.setup}>{setup}</div>
      </div>
    </main>
  );
}
