"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { PositionAnalysisModal } from "@/components/board/PositionAnalysisModal";
import { usePositionAnalysis } from "@/hooks/usePositionAnalysis";
import { usePanelReader, type PanelsReading } from "@/hooks/usePanelReader";
import { useScreenMirror, type Point } from "@/hooks/useScreenMirror";
import { playSound } from "@/lib/sound";
import { moveNotation } from "@/lib/xiangqi/notation";
import { applyMove, findKing, inCheck, legalMovesFrom, outcome, parseFen, sideOf, toFen, type Board, type Move, type Position, type Side } from "@/lib/xiangqi/engine";
import { gameReducer, newGame, type GameAction, type GameState } from "@/lib/xiangqi/game";
import Link from "next/link";
import styles from "./broadcast.module.css";
import zigaStyles from "./ziga/ziga.module.css";
import { EMPTY_DRAWING, drawingReducer } from "./drawing";
import { StagePanel, useStageLink, useStageSettings } from "./StagePanel";
import { changeResult, nextRound, resultOnBoard, type StageResult } from "./stage-round";
import { useStageArchive } from "./useStageArchive";
import { findRepair } from "./board-repair";
import { clockAfterMove, readClock, startClock, stopClock, type GameClock } from "./game-clock";
import { buildStageState, canReview, mergePanelReading, type StageClocks, type StageReviewState } from "./stage-sync";
import { TrialBar, useTrialMoves } from "./trial";
import { scrollMoveIntoBox } from "./scroll-moves";
import { clockSeconds } from "@/lib/vision/zigavn-panels";

const COLORS = [
  { value: "#3b82f6", label: "Xanh dương" },
  { value: "#22c55e", label: "Xanh lá" },
  { value: "#ef4444", label: "Đỏ" },
  { value: "#f59e0b", label: "Vàng" },
];

function playMoveSound(prevPos: Position, move: Move) {
  const isCapture = prevPos.board[move.to] !== null;
  const nextPos = applyMove(prevPos, move);
  const isCheck = inCheck(nextPos.board, nextPos.turn);
  if (isCheck) playSound("check");
  else if (isCapture) playSound("capture");
  else playSound("move");
}

/**
 * Ván trên trang nguồn là chuẩn: kể cả khi luật của app đã xử kết thúc (ví dụ lặp nước), vẫn ghi tiếp
 * nước đọc được để bàn cờ không lệch với trang kia.
 */
function broadcastReducer(state: GameState, action: GameAction | { type: "reset"; fen?: string }): GameState {
  if (action.type === "reset") return newGame(action.fen);
  if (action.type === "move" && state.result) return gameReducer({ ...state, result: null }, action);
  return gameReducer(state, action);
}

export function BroadcastClient() {
  const [game, dispatch] = useReducer(broadcastReducer, undefined, () => newGame());
  /** null = đang xem trực tiếp; số = đang xem lại thế cờ sau nửa nước thứ n. */
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [stageReview, setStageReview] = useState<StageReviewState | null>(null);

  const [sketch, draw] = useReducer(drawingReducer, EMPTY_DRAWING);
  // Chưa theo dõi thì bàn cờ để đi quân (bày lại các nước trang kia đã đi); bắt đầu theo dõi thì chuyển sang vẽ.
  const [drawing, setDrawing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [clearOnMove, setClearOnMove] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState<"fen" | "moves" | null>(null);
  const [stageSettings, setStageSettings] = useStageSettings();
  const stageLink = useStageLink();
  /** Kết quả người dẫn đã bấm cho ván đang chơi (đã cộng vào thành tích hôm nay). */
  const [roundResult, setRoundResult] = useState<StageResult | null>(null);
  /** Tự đọc nick, điểm, đồng hồ từ ô người chơi hai bên bàn cờ zigavn. */
  const [autoRead, setAutoRead] = useState(true);
  /**
   * Đồng hồ ván tự tính theo nước đi đọc được. running = null là đang chờ ván bắt đầu. `clockSync`: lần tới đọc được
   * giờ trên trang nguồn thì lấy làm mốc một lần (vào giữa ván, hoặc lúc trang kia bắt đầu chạy giờ ván mới).
   */
  const [clock, setClock] = useState<GameClock | null>(null);
  const clockSync = useRef(false);
  /** Thông báo lần tự sửa bàn cờ gần nhất (nhận nhầm nước), hoặc lời nhắc khi không tự sửa được. */
  const [repairNote, setRepairNote] = useState<{ ok: boolean; text: string } | null>(null);
  const boardColRef = useRef<HTMLDivElement>(null);
  const movesContainerRef = useRef<HTMLDivElement>(null);
  const activePlyRef = useRef<HTMLButtonElement>(null);
  const [videoSize, setVideoSize] = useState({ w: 1, h: 1 });

  const clearDrawings = useCallback(() => draw({ type: "clear" }), []);

  const timeControl = useMemo(
    () => ({ totalMs: stageSettings.timeControl.totalMin * 60_000, perMoveMs: stageSettings.timeControl.perMoveSec * 1000 }),
    [stageSettings.timeControl],
  );

  /**
   * Chốt giờ cho các nước vừa đi (đọc được hoặc đi bù bằng tay), dừng đồng hồ nếu ván đã phân thắng thua. Chưa có đồng
   * hồ (vd. trang được nạp lại code giữa lúc đang theo dõi) thì tạo mới, để sân khấu không bao giờ thiếu đồng hồ.
   */
  const tickClock = useCallback((before: Position, moves: Move[]) => {
    const now = Date.now();
    setClock((prev) => {
      let c = prev ?? startClock(timeControl, null, now);
      if (!prev) clockSync.current = true;
      let p = before;
      for (const m of moves) {
        c = clockAfterMove(c, p.turn, now);
        p = applyMove(p, m);
      }
      return outcome(p).over ? stopClock(c, now) : c;
    });
  }, [timeControl]);

  const onMoves = useCallback(
    (moves: Move[]) => {
      const before = game.history[game.history.length - 1];
      let currentPos = before;
      for (const move of moves) {
        playMoveSound(currentPos, move);
        currentPos = applyMove(currentPos, move);
        dispatch({ type: "move", move });
      }
      tickClock(before, moves);
      setSelected(null);
      if (clearOnMove) clearDrawings();
    },
    [clearOnMove, clearDrawings, game.history, tickClock],
  );

  /** Đặt đồng hồ cho ván bắt đầu theo dõi: `toMove` null = chờ ván bắt đầu (thế ban đầu). */
  const armClock = (toMove: Side | null) => {
    setClock(startClock(timeControl, toMove, Date.now()));
    clockSync.current = true;
  };
  // Trang kia bày lại thế ban đầu (sang ván mới): ghi kết quả ván cũ, bàn cờ ở đây cũng về đầu. Bộ theo dõi đã tự
  // về thế ban đầu nên không cần resync.
  const onRestart = () => {
    finishRound();
    // Ván mới một mã lưu mới, không thì ván này ghi đè lên bản lưu của ván trước.
    archive.newGame();
    armClock(null);
    dispatch({ type: "reset" });
    setViewPly(null);
    setSelected(null);
    clearDrawings();
  };
  // Ảnh trang kia đứng yên mà vẫn khác bàn cờ ở đây (đã nhận nhầm một nước): app đọc lại cả thế cờ, tìm nước nhầm
  // trong 1–2 nước gần nhất và thay bằng nước đúng, giữ nguyên phần biên bản trước đó.
  const onDesync = (board: Board) => {
    const fix = findRepair(game.history, board);
    if (!fix) {
      setRepairNote({
        ok: false,
        text: "Bàn cờ ở đây đang khác trang kia và app không tự sửa được. Bấm “Dừng”, rồi “Chọn cửa sổ” và “Bắt đầu theo dõi” lại: app sẽ tự đọc thế cờ đang có.",
      });
      return;
    }
    const n = game.history.length - 1;
    let p = game.history[n - fix.undo];
    const names: string[] = [];
    if (fix.undo) dispatch({ type: "undo", plies: fix.undo });
    for (const m of fix.moves) {
      names.push(moveNotation(p.board, m));
      dispatch({ type: "move", move: m });
      p = applyMove(p, m);
    }
    resync(p);
    // Đồng hồ đã tính cho các nước bị lùi; chỉ tính thêm phần nước đi lại vượt quá.
    if (fix.moves.length > fix.undo) tickClock(game.history[n], fix.moves.slice(fix.undo));
    setViewPly(null);
    const removed = game.moves.slice(n - fix.undo).map((m) => m.notation);
    setRepairNote({
      ok: true,
      text: `Đã tự sửa bàn cờ cho khớp trang kia: ${removed.length ? `bỏ ${removed.join(", ")} (nhận nhầm)` : "thêm nước bị sót"}${names.length ? `, ghi lại ${names.join(", ")}` : ""}.`,
    });
  };
  const {
    videoRef, status, error: captureError, corners, bottom, diag, surface, start, stop, addCorner, follow, resync, repick, grabRegion, detected, clearDetected,
  } = useScreenMirror(onMoves, onRestart, onDesync);

  /** Bắt đầu theo dõi từ thế cờ giữa ván app vừa đọc được, khi người dùng chọn bên đang tới lượt. */
  const followDetected = (turn: Side) => {
    if (!detected) return;
    const fen = toFen({ board: detected.board, turn });
    dispatch({ type: "reset", fen });
    setViewPly(null);
    setSelected(null);
    clearDrawings();
    clearDetected();
    if (follow(parseFen(fen), detected.bottom)) {
      setDrawing(true);
      armClock(turn);
    }
  };

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
      playMoveSound(livePos, move);
      dispatch({ type: "move", move });
      if (status === "following") {
        resync(applyMove(livePos, move));
        tickClock(livePos, [move]);
      }
      setSelected(null);
      return;
    }
    const piece = livePos.board[i];
    setSelected(piece && sideOf(piece) === livePos.turn && i !== selected ? i : null);
  };
  const liveNotations = useMemo(() => game.moves.map((m) => m.notation), [game.moves]);
  const trial = useTrialMoves(liveNotations);
  // Thoát đi thử thì trả chế độ vẽ về như trước (đang theo dõi thường là đang vẽ; tắt vẽ thì bấm bàn cờ là đi thật).
  const drawingBeforeTrial = useRef(false);
  const toggleTrial = () => {
    if (trial.trial) {
      trial.exit();
      setDrawing(drawingBeforeTrial.current);
      return;
    }
    drawingBeforeTrial.current = drawing;
    trial.start(pos);
    setDrawing(false);
    setSelected(null);
  };
  // Mặc định đặt bàn cờ như trang nguồn (phe ngồi dưới ở đó cũng ở dưới ở đây).
  const baseOrientation: Side = bottom ?? "r";
  const orientation: Side = flipped ? (baseOrientation === "r" ? "b" : "r") : baseOrientation;
  // Người dẫn luôn ở ô trái, và màu cờ của người dẫn luôn là màu cờ phía dưới bàn cờ (orientation).
  const mySide: Side = orientation;
  const oppSide: Side = mySide === "r" ? "b" : "r";
  const isGameOver = Boolean(
    game.result ||
    roundResult ||
    (game.moves.length > 0 && resultOnBoard(game.history[game.moves.length], mySide))
  );
  // Pure anti-cheat: chỉ kích hoạt review lên sân khấu nếu thỏa mãn quy tắc an toàn
  const activeReview = stageReview && canReview(isGameOver, game.moves.length) ? stageReview : null;

  const handleUpdateReview = useCallback(
    (rev: StageReviewState | null) => {
      if (rev && !canReview(isGameOver, game.moves.length)) {
        return;
      }
      setStageReview(rev);
    },
    [isGameOver, game.moves.length],
  );

  const turnNow = livePos.turn;
  const noClock = clock === null;
  const onPanels = useCallback(
    (r: PanelsReading) => {
      setStageSettings((s) => mergePanelReading(s, r.me, r.opponent));
      // Giờ trên trang nguồn chỉ lấy làm mốc một lần; sau đó app tự tính theo nước đi.
      const me = r.me.clock ? clockSeconds(r.me.clock) : null;
      const opp = r.opponent.clock ? clockSeconds(r.opponent.clock) : null;
      // Lấy mốc khi vừa đặt đồng hồ, hoặc khi chưa có đồng hồ nào (vào giữa lúc đang theo dõi).
      if (me === null || opp === null || (!clockSync.current && !noClock)) return;
      clockSync.current = false;
      setClock((prev) => {
        const c = prev ?? startClock(timeControl, null, r.at);
        return {
          ...c,
          remaining: { [mySide]: me * 1000, [oppSide]: opp * 1000 } as Record<Side, number>,
          // Trang kia đã chạy giờ (ô điểm thành đồng hồ) mà chưa thấy nước nào: ván vừa bắt đầu.
          running: c.running ?? turnNow,
          since: r.at,
        };
      });
    },
    [setStageSettings, mySide, oppSide, turnNow, timeControl, noClock],
  );
  usePanelReader(grabRegion, autoRead && status === "following", onPanels);

  const onBoard = resultOnBoard(game.history[game.moves.length], mySide);
  const fens = useMemo(() => game.history.map(toFen), [game.history]);
  const archive = useStageArchive({
    room: stageLink.room,
    site: "manual",
    round: stageSettings.round,
    mySide,
    me: stageSettings.me,
    opponent: stageSettings.opponent,
    moves: game.moves,
    fens,
    roundResult,
    onBoardResult: onBoard,
  });

  const onAnnotate = useCallback((from: number, to: number) => draw({ type: "annotate", from, to, color }), [color]);

  /** Lùi nước cuối (tự đi nhầm hoặc app đọc sai): bộ theo dõi sẽ đọc lại từ thế cờ trước đó. */
  const undoMistake = () => {
    if (game.moves.length === 0) return;
    resync(game.history[game.history.length - 2]);
    dispatch({ type: "undo", plies: 1 });
    setViewPly(null);
    setSelected(null);
  };

  /** Hết ván (có nước đi): tự ghi kết quả nếu bàn cờ đã phân thắng thua mà chưa bấm, rồi sang ván sau. */
  function finishRound() {
    if (game.moves.length === 0) return;
    const currentOnBoard = resultOnBoard(game.history[game.moves.length], mySide);
    void archive.saveNow(roundResult ?? currentOnBoard, roundResult ? "manual" : currentOnBoard ? "board" : null);
    setStageSettings((s) => nextRound(s, roundResult, currentOnBoard));
    setRoundResult(null);
  }

  const recordResult = (r: StageResult | null) => {
    setStageSettings((s) => ({ ...s, today: changeResult(s.today, roundResult, r) }));
    setRoundResult(r);
    if (r) {
      void archive.saveNow(r, "manual");
    }
  };

  const newMatch = () => {
    finishRound();
    archive.newGame();
    if (status === "following") armClock(null);
    dispatch({ type: "reset" });
    resync(newGame().history[0]);
    setViewPly(null);
    clearDrawings();
  };

  const lastCapturedPiece =
    ply > 0 && game.moves[ply - 1]
      ? game.history[ply - 1].board[game.moves[ply - 1].move.to]
      : null;

  // Ảnh chụp đồng hồ để gửi sân khấu: chỉ đổi khi có nước đi / lấy mốc, sân khấu tự đếm lùi giữa các lần đó.
  const stageClocks = useMemo((): StageClocks | null => {
    if (!clock) return null;
    const now = Date.now();
    const v = readClock(clock, now);
    return {
      me: v.total[mySide],
      opponent: v.total[oppSide],
      running: clock.running === null ? null : clock.running === mySide ? "me" : "opponent",
      perMove: v.perMove,
      perMoveTotal: clock.control.perMoveMs,
      sentAt: now,
    };
  }, [clock, mySide, oppSide]);

  // Gửi trạng thái sang trang sân khấu (OBS Browser Source) qua /ws/stage. Phe của người dẫn = màu cờ phía dưới bàn cờ.
  const { send: sendStage } = stageLink;
  useEffect(() => {
    sendStage({
      t: "state",
      state: buildStageState({
        board: pos.board,
        turn: pos.turn,
        ply,
        lastMove,
        checkSquare,
        notations: game.moves.map((m) => m.notation),
        arrows: sketch.present.arrows,
        highlights: sketch.present.marks,
        mySide,
        settings: stageSettings,
        capturedPiece: lastCapturedPiece,
        // Đồng hồ chỉ đúng với thế cờ đang diễn ra; xem lại nước cũ thì ẩn.
        clocks: live ? stageClocks : null,
        review: activeReview,
        // Đi thử: bàn cờ là biến thử, còn lượt đi / đồng hồ vẫn của ván thật đang chạy ngầm.
        ...(trial.stage && { ...trial.stage, turn: livePos.turn, ply: game.moves.length, capturedPiece: null, clocks: stageClocks }),
      }),
    });
  }, [sendStage, pos, ply, lastMove, checkSquare, game.moves, sketch.present, mySide, stageSettings, lastCapturedPiece, live, stageClocks, trial.stage, livePos.turn, activeReview]);

  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    scrollMoveIntoBox(movesContainerRef.current, activePlyRef.current);
  }, [ply, game.moves.length]);

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
      if (e.key === " " && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setDrawing((d) => !d);
        setSelected(null);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setViewPly(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setViewPly(null);
        return;
      }
      if (["1", "2", "3", "4"].includes(e.key) && !e.ctrlKey && !e.metaKey) {
        const idx = Number(e.key) - 1;
        if (COLORS[idx]) setColor(COLORS[idx].value);
        return;
      }
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

  const copyFen = async () => {
    try {
      const fen = toFen(pos);
      await navigator.clipboard.writeText(fen);
      setCopied("fen");
      setTimeout(() => setCopied((c) => (c === "fen" ? null : c)), 2000);
    } catch {}
  };

  const copyMoves = async () => {
    try {
      const text = pairs
        .map((p) => `${p.round}. ${p.plies.map((x) => x.text).join(" ")}`)
        .join("\n");
      await navigator.clipboard.writeText(text);
      setCopied("moves");
      setTimeout(() => setCopied((c) => (c === "moves" ? null : c)), 2000);
    } catch {}
  };

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
      <nav aria-label="Chế độ tường thuật" className={zigaStyles.subnav}>
        <Link href="/tuong-thuat" className={`${zigaStyles.subnavLink} ${zigaStyles.subnavActive}`}>
          📷 Thị giác máy tính (Chụp màn hình)
        </Link>
        <Link href="/tuong-thuat/ziga" className={zigaStyles.subnavLink}>
          ⚡ Đồng bộ WebSocket trực tiếp (Ziga Hook)
        </Link>
        <Link href="/tuong-thuat/lich-su" className={zigaStyles.subnavLink}>
          📜 Lịch sử ván đấu
        </Link>
      </nav>

      <div ref={boardColRef} className={styles.boardCol}>
        <XiangqiBoard
          board={trial.stage?.board ?? pos.board}
          orientation={orientation}
          lastMove={trial.stage ? trial.stage.lastMove : lastMove}
          checkSquare={trial.stage ? trial.stage.checkSquare : checkSquare}
          selected={trial.stage ? trial.stage.selected : canMove ? selected : null}
          targets={trial.stage?.targets ?? targets}
          onSquareClick={trial.stage ? trial.onSquareClick : onSquareClick}
          disabled={trial.stage ? drawing : !canMove}
          arrows={sketch.present.arrows}
          highlights={sketch.present.marks}
          sketchColor={color}
          onAnnotate={drawing ? onAnnotate : undefined}
        />
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.btn}
            aria-pressed={drawing}
            title={drawing ? "Tắt vẽ để đi quân bằng tay (Phím Space)" : "Bật chế độ vẽ mũi tên & khoanh ô (Phím Space)"}
            onClick={() => {
              setDrawing((d) => !d);
              setSelected(null);
            }}
          >
            ✏️ {drawing ? "Đang vẽ" : "Vẽ"}
          </button>
          <button
            type="button"
            className={styles.btn}
            aria-pressed={!!trial.trial}
            title="Bày biến trên bàn cờ tạm để giải thích; ván thật vẫn chạy ngầm, sân khấu ghi rõ BIẾN THỬ"
            onClick={toggleTrial}
          >
            🧪 {trial.trial ? "Thoát đi thử" : "Đi thử"}
          </button>
          {COLORS.map((c, idx) => (
            <button
              key={c.value}
              type="button"
              className={styles.swatch}
              style={{ background: c.value }}
              aria-label={`Màu ${c.label}`}
              title={`Màu ${c.label} (Phím ${idx + 1})`}
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
        <TrialBar t={trial} onExit={toggleTrial} />
      </div>

      <aside className={styles.panel}>
        <StagePanel
          settings={stageSettings}
          setSettings={setStageSettings}
          link={stageLink}
          result={roundResult}
          onResult={recordResult}
          autoRead={autoRead}
          onAutoRead={setAutoRead}
          clocks={stageClocks}
          mySide={mySide}
          onToggleSide={() => setFlipped((f) => !f)}
          archive={archive}
          review={activeReview}
          onUpdateReview={handleUpdateReview}
        />

        <section className={styles.card}>
          <h1 className={styles.title}>Tường thuật</h1>
          <p className={styles.step}>{step}</p>
          {repairNote && (
            <p className={repairNote.ok ? styles.warn : styles.error} role="status">
              {repairNote.text}{" "}
              <button type="button" className={styles.btn} onClick={() => setRepairNote(null)}>
                Đã hiểu
              </button>
            </p>
          )}
          {detected && (
            <div className={styles.detectBox} role="status">
              <p className={styles.step}>
                Đã đọc được thế cờ giữa ván trên trang kia. Kiểm tra bàn cờ nhỏ bên dưới cho khớp, rồi chọn bên đang tới lượt đi:
              </p>
              <XiangqiBoard board={detected.board} orientation={detected.bottom} disabled className={styles.detectBoard} />
              <div className={styles.row}>
                <button type="button" className={styles.btnGold} onClick={() => followDetected("r")}>
                  Đỏ đang tới lượt
                </button>
                <button type="button" className={styles.btnGold} onClick={() => followDetected("b")}>
                  Đen đang tới lượt
                </button>
                <button type="button" className={styles.btn} onClick={clearDetected}>
                  Không đúng
                </button>
              </div>
            </div>
          )}
          {captureError && (
            <div className={styles.errorBox} role="alert">
              <p className={styles.error}>{captureError}</p>
              {game.moves.length > 0 && (
                <div>
                  <button type="button" className={styles.btnGold} onClick={newMatch}>
                    ↺ Đặt lại ván mới về đầu
                  </button>
                </div>
              )}
            </div>
          )}
          {status !== "idle" && surface && surface !== "browser" && (
            <p className={styles.warn} role="status">
              {surface === "window"
                ? "Bạn đang chia sẻ cả một cửa sổ: app chỉ thấy tab đang hiện trong cửa sổ đó. Nếu trang cờ kia ở chung cửa sổ với trang này, mỗi lần bạn quay lại đây app sẽ không thấy bàn cờ và lỡ nước. Nên bấm “Dừng”, chọn lại và chọn mục “Tab”; hoặc tách trang kia ra cửa sổ riêng, đặt cạnh trang này."
                : "Bạn đang chia sẻ toàn màn hình: app chỉ thấy những gì đang hiện trên màn hình. Cửa sổ trang cờ kia phải luôn hiện, không bị che hay thu nhỏ. Nên bấm “Dừng”, chọn lại và chọn mục “Tab”."}
            </p>
          )}
          {status === "following" && diag && (
            <p className={styles.diag} aria-live="polite">
              {diag.occluded
                ? `Có thứ đang đè lên bàn cờ (${diag.occluded} ô): thông báo, hiệu ứng, hoặc cửa sổ khác. App tạm dừng đọc nước cho tới khi bàn cờ hiện rõ lại.${surface !== "browser" ? " Nên chia sẻ dạng “Tab” để cửa sổ khác (kể cả màn hình sân khấu) không lọt vào khung chụp." : ""}`
                : diag.resized
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
                      if (follow(livePos)) {
                        setDrawing(true);
                        // Theo dõi từ thế ban đầu: chờ ván bắt đầu; từ thế đã bày lại: bên tới lượt đang chạy giờ.
                        armClock(game.moves.length === 0 ? null : livePos.turn);
                      }
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
          <div className={styles.row}>
            <button type="button" className={styles.btn} onClick={copyFen} title="Sao chép FEN của thế cờ đang xem">
              {copied === "fen" ? "✓ Đã chép FEN" : "📋 Chép FEN"}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={copyMoves}
              disabled={game.moves.length === 0}
              title="Sao chép toàn bộ biên bản nước đi của ván"
            >
              {copied === "moves" ? "✓ Đã chép biên bản" : "📋 Chép biên bản"}
            </button>
          </div>
          <div ref={movesContainerRef} className={styles.moves} aria-label="Biên bản nước đi">
            {pairs.length === 0 && <p className={styles.muted}>Chưa có nước nào.</p>}
            {pairs.map((p) => (
              <div key={p.round} className={styles.moveRow}>
                <span className={styles.moveNum}>{p.round}.</span>
                {p.plies.map((x) => (
                  <button
                    key={x.ply}
                    ref={x.ply === ply ? activePlyRef : undefined}
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
  const cornerR = Math.max(7, w / 120);
  return (
    <svg className={styles.gridPreview} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={Math.max(3, w / 300)} fill="#facc15" stroke="#000" strokeWidth={Math.max(1, w / 1200)} />
      ))}
      {a && (
        <circle cx={a.x * w} cy={a.y * h} r={cornerR} fill="none" stroke="#22c55e" strokeWidth={Math.max(2, w / 400)} />
      )}
      {b && (
        <circle cx={b.x * w} cy={b.y * h} r={cornerR} fill="none" stroke="#22c55e" strokeWidth={Math.max(2, w / 400)} />
      )}
    </svg>
  );
}
