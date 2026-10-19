"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { PositionAnalysisModal } from "@/components/board/PositionAnalysisModal";
import { usePositionAnalysis } from "@/hooks/usePositionAnalysis";
import { useScreenMirror, type Point } from "@/hooks/useScreenMirror";
import { applyMove, findKing, inCheck, legalMovesFrom, sideOf, type Move, type Side } from "@/lib/xiangqi/engine";
import { gameReducer, newGame, type GameAction, type GameState } from "@/lib/xiangqi/game";
import styles from "./broadcast.module.css";
import { EMPTY_DRAWING, drawingReducer } from "./drawing";

const COLORS = [
  { value: "#3b82f6", label: "Xanh dương" },
  { value: "#22c55e", label: "Xanh lá" },
  { value: "#ef4444", label: "Đỏ" },
  { value: "#f59e0b", label: "Vàng" },
];

/**
 * Ván trên trang nguồn là chuẩn: kể cả khi luật của app đã xử kết thúc (ví dụ lặp nước), vẫn ghi tiếp
 * nước đọc được để bàn cờ không lệch với trang kia.
 */
function broadcastReducer(state: GameState, action: GameAction | { type: "reset" }): GameState {
  if (action.type === "reset") return newGame();
  if (action.type === "move" && state.result) return gameReducer({ ...state, result: null }, action);
  return gameReducer(state, action);
}

export function BroadcastClient() {
  const [game, dispatch] = useReducer(broadcastReducer, undefined, () => newGame());
  /** null = đang xem trực tiếp; số = đang xem lại thế cờ sau nửa nước thứ n. */
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [sketch, draw] = useReducer(drawingReducer, EMPTY_DRAWING);
  // Chưa theo dõi thì bàn cờ để đi quân (bày lại các nước trang kia đã đi); bắt đầu theo dõi thì chuyển sang vẽ.
  const [drawing, setDrawing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [clearOnMove, setClearOnMove] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const boardColRef = useRef<HTMLDivElement>(null);
  const [videoSize, setVideoSize] = useState({ w: 1, h: 1 });

  const clearDrawings = useCallback(() => draw({ type: "clear" }), []);

  const onMoves = useCallback(
    (moves: Move[]) => {
      for (const move of moves) dispatch({ type: "move", move });
      setSelected(null);
      if (clearOnMove) clearDrawings();
    },
    [clearOnMove, clearDrawings],
  );
  const {
    videoRef, status, error: captureError, corners, bottom, diag, surface, start, stop, addCorner, follow, resync, repick,
  } = useScreenMirror(onMoves);

  const live = viewPly === null;
  const ply = viewPly ?? game.moves.length;
  const pos = game.history[ply];
  const lastMove = ply > 0 ? game.moves[ply - 1].move : null;
  const checkSquare = inCheck(pos.board, pos.turn) ? findKing(pos.board, pos.turn) : null;
  const livePos = game.history[game.moves.length];
  // Đi quân bằng tay: bày lại thế cờ trước khi theo dõi, hoặc đi bù nước app đọc sót trong lúc theo dõi.
  const canMove = live && !drawing;
  const targets = canMove && selected !== null ? legalMovesFrom(livePos, selected).map((m) => m.to) : [];
  const onSquareClick = (i: number) => {
    if (selected !== null && targets.includes(i)) {
      const move = { from: selected, to: i };
      dispatch({ type: "move", move });
      if (status === "following") resync(applyMove(livePos, move));
      setSelected(null);
      return;
    }
    const piece = livePos.board[i];
    setSelected(piece && sideOf(piece) === livePos.turn && i !== selected ? i : null);
  };
  // Mặc định đặt bàn cờ như trang nguồn (phe ngồi dưới ở đó cũng ở dưới ở đây).
  const baseOrientation: Side = bottom ?? "r";
  const orientation: Side = flipped ? (baseOrientation === "r" ? "b" : "r") : baseOrientation;

  const onAnnotate = useCallback((from: number, to: number) => draw({ type: "annotate", from, to, color }), [color]);

  /** Lùi nước cuối (tự đi nhầm hoặc app đọc sai): bộ theo dõi sẽ đọc lại từ thế cờ trước đó. */
  const undoMistake = () => {
    if (game.moves.length === 0) return;
    resync(game.history[game.history.length - 2]);
    dispatch({ type: "undo", plies: 1 });
    setViewPly(null);
    setSelected(null);
  };

  const newMatch = () => {
    dispatch({ type: "reset" });
    resync(newGame().history[0]);
    setViewPly(null);
    clearDrawings();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void boardColRef.current?.requestFullscreen();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Z hoàn tác nét vẽ; Ctrl+Y hoặc Ctrl+Shift+Z làm lại. Các tổ hợp khác (Ctrl+C…) để trình duyệt xử lý.
        if (key === "z" && !e.shiftKey) draw({ type: "undo" });
        else if (key === "y" || (key === "z" && e.shiftKey)) draw({ type: "redo" });
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey) return;
      if (e.key === "Escape" || key === "c") clearDrawings();
      else if (e.key === "ArrowLeft") setViewPly((v) => Math.max(0, (v ?? game.moves.length) - 1));
      else if (e.key === "ArrowRight")
        setViewPly((v) => (v === null || v + 1 >= game.moves.length ? null : v + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearDrawings, game.moves.length]);

  const {
    result: posResult,
    loading: posLoading,
    error: posError,
    analyze,
  } = usePositionAnalysis();
  const [showAnalysis, setShowAnalysis] = useState(false);
  const openAnalysis = () => {
    setShowAnalysis(true);
    const played = game.moves.slice(0, ply);
    void analyze(pos.board, pos.turn, played.map((m) => m.move), played.map((m) => m.notation));
  };

  const pairs = useMemo(() => {
    const out: { round: number; plies: { ply: number; text: string }[] }[] = [];
    game.moves.forEach((m, i) => {
      if (i % 2 === 0) out.push({ round: i / 2 + 1, plies: [] });
      out[out.length - 1].plies.push({ ply: i + 1, text: m.notation });
    });
    return out;
  }, [game.moves]);

  const [a, b] = corners;
  const step =
    status === "idle"
      ? "Mở trang cờ kia rồi bấm “Chọn cửa sổ” và chọn tab của trang đó. Nếu ván bên kia đã đi vài nước, hãy tự đi lại các nước đó trên bàn cờ bên trái (bấm quân rồi bấm ô đến) cho giống hệt trước khi bắt đầu theo dõi."
      : status === "picking"
        ? corners.length === 0
          ? "Bấm vào giao điểm góc trên-trái của lưới bàn cờ trong khung dưới đây."
          : corners.length === 1
            ? "Bấm tiếp vào giao điểm góc dưới-phải của lưới."
            : "Các chấm vàng phải nằm đúng trên 90 giao điểm, và bàn cờ bên trái phải giống hệt trang kia (chưa giống thì tự đi quân cho giống). Xong thì bấm “Bắt đầu theo dõi”."
        : "Đang theo dõi. Nước đi trên trang kia sẽ tự hiện trên bàn cờ.";

  return (
    <main className={styles.layout}>
      <div ref={boardColRef} className={styles.boardCol}>
        <XiangqiBoard
          board={pos.board}
          orientation={orientation}
          lastMove={lastMove}
          checkSquare={checkSquare}
          selected={canMove ? selected : null}
          targets={targets}
          onSquareClick={onSquareClick}
          disabled={!canMove}
          arrows={sketch.present.arrows}
          highlights={sketch.present.marks}
          onAnnotate={drawing ? onAnnotate : undefined}
        />
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.btn}
            aria-pressed={drawing}
            title={drawing ? "Tắt vẽ để đi quân bằng tay" : "Đang đi quân bằng tay: bấm quân rồi bấm ô đến"}
            onClick={() => {
              setDrawing((d) => !d);
              setSelected(null);
            }}
          >
            ✏️ {drawing ? "Đang vẽ" : "Vẽ"}
          </button>
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={styles.swatch}
              style={{ background: c.value }}
              aria-label={`Màu ${c.label}`}
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
            />
          ))}
          <button type="button" className={styles.btn} onClick={() => draw({ type: "undo" })} disabled={sketch.past.length === 0} title="Hoàn tác nét vẽ (Ctrl+Z)" aria-label="Hoàn tác nét vẽ">
            ↶
          </button>
          <button type="button" className={styles.btn} onClick={() => draw({ type: "redo" })} disabled={sketch.future.length === 0} title="Làm lại (Ctrl+Y)" aria-label="Làm lại nét vẽ">
            ↷
          </button>
          <button type="button" className={styles.btn} onClick={clearDrawings} title="Phím C hoặc Esc">
            Xóa nét vẽ
          </button>
          <button type="button" className={styles.btn} onClick={() => setFlipped((f) => !f)}>
            ⇅ Lật bàn
          </button>
          <button type="button" className={styles.btn} onClick={toggleFullscreen}>
            ⛶ Toàn màn hình
          </button>
        </div>
        {!live && (
          <div className={styles.reviewBar}>
            Đang xem lại nước {ply}/{game.moves.length}
            <button type="button" className={styles.btnGold} onClick={() => setViewPly(null)}>
              Về trực tiếp
            </button>
          </div>
        )}
      </div>

      <aside className={styles.panel}>
        <section className={styles.card}>
          <h1 className={styles.title}>Tường thuật</h1>
          <p className={styles.step}>{step}</p>
          {captureError && <p className={styles.error} role="alert">{captureError}</p>}
          {status !== "idle" && surface && surface !== "browser" && (
            <p className={styles.warn} role="status">
              {surface === "window"
                ? "Bạn đang chia sẻ cả một cửa sổ: app chỉ thấy tab đang hiện trong cửa sổ đó. Nếu trang cờ kia ở chung cửa sổ với trang này, mỗi lần bạn quay lại đây app sẽ không thấy bàn cờ và lỡ nước. Nên bấm “Dừng”, chọn lại và chọn mục “Tab”; hoặc tách trang kia ra cửa sổ riêng, đặt cạnh trang này."
                : "Bạn đang chia sẻ toàn màn hình: app chỉ thấy những gì đang hiện trên màn hình. Cửa sổ trang cờ kia phải luôn hiện, không bị che hay thu nhỏ. Nên bấm “Dừng”, chọn lại và chọn mục “Tab”."}
            </p>
          )}
          {status === "following" && diag && (
            <p className={styles.diag} aria-live="polite">
              {diag.resized
                ? "Khung chụp đã đổi kích thước (cửa sổ trang kia bị co giãn hoặc phóng to) nên bàn cờ không còn ở chỗ cũ. Đưa cửa sổ về như cũ hoặc bấm “Chọn lại góc”."
                : diag.movingStreak >= 10
                ? "Ảnh bàn cờ thay đổi liên tục nên chưa đọc được. Trong vùng bàn cờ có thứ đang chuyển động (hiệu ứng, con trỏ chuột, đồng hồ…): đưa chuột ra khỏi bàn cờ hoặc tắt hiệu ứng của trang kia."
                : diag.mismatched > 3
                  ? `Ảnh lệch với thế cờ đang theo dõi ở ${diag.mismatched} ô. Có thể khung chụp đang không hiện bàn cờ (cửa sổ bị che, đang ở tab khác), trang kia đã cuộn/đổi bố cục (bấm “Chọn lại góc”), hoặc bên kia đã đi quá nhiều nước khi app không nhìn thấy.`
                  : diag.moving
                    ? "Đang chờ ảnh đứng yên…"
                    : "Ảnh khớp thế cờ, đang chờ nước tiếp theo."}
              <span className={styles.muted}> · {diag.frames} khung</span>
            </p>
          )}

          <div className={styles.captureBox} data-hidden={status === "idle" || undefined} data-small={status === "following" || undefined}>
            <video
              ref={videoRef}
              className={styles.video}
              muted
              playsInline
              onLoadedMetadata={(e) => setVideoSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
              onResize={(e) => setVideoSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
              onClick={(e) => status === "picking" && addCorner(e.clientX, e.clientY)}
            />
            {status === "picking" && (
              <GridPreview w={videoSize.w} h={videoSize.h} a={a} b={b} />
            )}
          </div>

          <div className={styles.row}>
            {status === "idle" ? (
              <button type="button" className={styles.btnGold} onClick={() => void start()}>
                Chọn cửa sổ
              </button>
            ) : (
              <>
                {status === "picking" && (
                  <button
                    type="button"
                    className={styles.btnGold}
                    disabled={corners.length < 2}
                    onClick={() => {
                      setViewPly(null);
                      setSelected(null);
                      if (follow(livePos)) setDrawing(true);
                    }}
                  >
                    Bắt đầu theo dõi
                  </button>
                )}
                {status === "following" && (
                  <button type="button" className={styles.btn} onClick={repick}>
                    Chọn lại góc
                  </button>
                )}
                <button type="button" className={styles.btn} onClick={stop}>
                  Dừng
                </button>
              </>
            )}
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={clearOnMove} onChange={(e) => setClearOnMove(e.target.checked)} />
            Tự xóa nét vẽ khi có nước mới
          </label>
        </section>

        <section className={styles.card}>
          <div className={styles.row}>
            <button type="button" className={styles.btnGold} onClick={openAnalysis}>
              🔍 Phân tích thế cờ
            </button>
            <button type="button" className={styles.btn} onClick={undoMistake} disabled={game.moves.length === 0} title="Bỏ nước cuối cùng: khi bạn tự đi nhầm lúc bày thế cờ, hoặc khi app đọc sai một nước (app sẽ đọc lại từ thế trước đó)">
              ↶ Đi lại 1 nước
            </button>
            <button type="button" className={styles.btn} onClick={newMatch}>
              Ván mới
            </button>
          </div>
          <div className={styles.moves} aria-label="Biên bản nước đi">
            {pairs.length === 0 && <p className={styles.muted}>Chưa có nước nào.</p>}
            {pairs.map((p) => (
              <div key={p.round} className={styles.moveRow}>
                <span className={styles.moveNum}>{p.round}.</span>
                {p.plies.map((x) => (
                  <button
                    key={x.ply}
                    type="button"
                    className={styles.moveCell}
                    aria-current={x.ply === ply || undefined}
                    onClick={() => setViewPly(x.ply === game.moves.length ? null : x.ply)}
                  >
                    {x.text}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      </aside>

      <PositionAnalysisModal
        isOpen={showAnalysis}
        onClose={() => setShowAnalysis(false)}
        analysis={posResult}
        loading={posLoading}
        error={posError}
      />
    </main>
  );
}

/** Chấm 2 góc đã bấm và (khi đủ 2 góc) 90 giao điểm sẽ được đọc, vẽ đè lên khung video (góc tính theo tỉ lệ khung). */
function GridPreview({ w, h, a, b }: { w: number; h: number; a?: Point; b?: Point }) {
  const dots: { x: number; y: number }[] = [];
  if (a && b) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) dots.push({ x: (a.x + ((b.x - a.x) * c) / 8) * w, y: (a.y + ((b.y - a.y) * r) / 9) * h });
    }
  } else if (a) dots.push({ x: a.x * w, y: a.y * h });
  return (
    <svg className={styles.gridPreview} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={Math.max(3, w / 300)} fill="#facc15" stroke="#000" strokeWidth={Math.max(1, w / 1200)} />
      ))}
    </svg>
  );
}
