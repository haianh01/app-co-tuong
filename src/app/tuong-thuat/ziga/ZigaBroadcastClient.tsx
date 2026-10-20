"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { PositionAnalysisModal } from "@/components/board/PositionAnalysisModal";
import { usePositionAnalysis } from "@/hooks/usePositionAnalysis";
import { playSound } from "@/lib/sound";
import { moveNotation } from "@/lib/xiangqi/notation";
import {
  applyMove,
  findKing,
  inCheck,
  legalMovesFrom,
  outcome,
  parseFen,
  sideOf,
  toFen,
  type Move,
  type Position,
  type Side,
} from "@/lib/xiangqi/engine";
import { gameReducer, newGame, type GameAction, type GameState } from "@/lib/xiangqi/game";
import styles from "../broadcast.module.css";
import zigaStyles from "./ziga.module.css";
import { EMPTY_DRAWING, drawingReducer } from "../drawing";
import { StagePanel, useStageLink, useStageSettings } from "../StagePanel";
import { changeResult, type StageResult } from "../stage-round";
import { clockAfterMove, readClock, startClock, stopClock, type GameClock } from "../game-clock";
import { buildStageState, type StageClocks } from "../stage-sync";
import { generateTampermonkeyScript } from "@/lib/ziga/tampermonkey-script";
import { parseZigaPacket, type ZigaParsedMessage } from "@/lib/ziga/ziga-parser";
import type { ZigaRelayPacket } from "@/app/api/tuong-thuat/ziga-relay/route";

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

function broadcastReducer(state: GameState, action: GameAction | { type: "reset"; fen?: string }): GameState {
  if (action.type === "reset") return newGame(action.fen);
  if (action.type === "move" && state.result) return gameReducer({ ...state, result: null }, action);
  return gameReducer(state, action);
}

export function ZigaBroadcastClient() {
  const [game, dispatch] = useReducer(broadcastReducer, undefined, () => newGame());
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [sketch, draw] = useReducer(drawingReducer, EMPTY_DRAWING);
  const [drawing, setDrawing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [clearOnMove, setClearOnMove] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState<"fen" | "moves" | "script" | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [stageSettings, setStageSettings] = useStageSettings();
  const stageLink = useStageLink();
  const [roundResult, setRoundResult] = useState<StageResult | null>(null);
  const [autoApply, setAutoApply] = useState(true);

  // Trạng thái kết nối SSE tới relay
  const [sseConnected, setSseConnected] = useState(false);
  const [packets, setPackets] = useState<ZigaRelayPacket[]>([]);
  const [customTestInput, setCustomTestInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // Đồng hồ ván đấu
  const [clock, setClock] = useState<GameClock | null>(null);
  const boardColRef = useRef<HTMLDivElement>(null);
  const movesContainerRef = useRef<HTMLDivElement>(null);
  const activePlyRef = useRef<HTMLButtonElement>(null);

  const clearDrawings = useCallback(() => draw({ type: "clear" }), []);

  const timeControl = useMemo(
    () => ({ totalMs: stageSettings.timeControl.totalMin * 60_000, perMoveMs: stageSettings.timeControl.perMoveSec * 1000 }),
    [stageSettings.timeControl],
  );

  const tickClock = useCallback(
    (before: Position, moves: Move[]) => {
      const now = Date.now();
      setClock((prev) => {
        let c = prev ?? startClock(timeControl, null, now);
        let p = before;
        for (const m of moves) {
          c = clockAfterMove(c, p.turn, now);
          p = applyMove(p, m);
        }
        return outcome(p).over ? stopClock(c, now) : c;
      });
    },
    [timeControl],
  );

  const live = viewPly === null;
  const ply = viewPly ?? game.moves.length;
  const pos = game.history[ply];
  const lastMove = ply > 0 ? game.moves[ply - 1].move : null;
  const checkSquare = inCheck(pos.board, pos.turn) ? findKing(pos.board, pos.turn) : null;
  const livePos = game.history[game.moves.length];

  const orientation: Side = flipped ? "b" : "r";
  const mySide: Side = orientation;
  const oppSide: Side = mySide === "r" ? "b" : "r";

  // Xử lý gói tin khi nhận được từ Ziga Relay
  const handleIncomingPacket = useCallback(
    (packet: ZigaRelayPacket) => {
      setPackets((prev) => [packet, ...prev].slice(0, 50));
      const { parsed } = packet;

      // 1. Cập nhật thông tin kỳ thủ nếu có
      if (parsed.players) {
        setStageSettings((s) => {
          const redName = parsed.players?.red?.name;
          const redScore = parsed.players?.red?.points;
          const blackName = parsed.players?.black?.name;
          const blackScore = parsed.players?.black?.points;
          return {
            ...s,
            me: {
              ...s.me,
              name: (mySide === "r" ? redName : blackName) || s.me.name,
              points: (mySide === "r" ? redScore : blackScore) || s.me.points,
            },
            opponent: {
              ...s.opponent,
              name: (oppSide === "r" ? redName : blackName) || s.opponent.name,
              points: (oppSide === "r" ? redScore : blackScore) || s.opponent.points,
            },
          };
        });
      }

      // 2. Cập nhật đồng hồ nếu có
      if (parsed.clocks) {
        setClock((prev) => {
          const now = Date.now();
          const c = prev ?? startClock(timeControl, null, now);
          return {
            ...c,
            remaining: {
              r: parsed.clocks?.redMs ?? c.remaining.r,
              b: parsed.clocks?.blackMs ?? c.remaining.b,
            },
            since: now,
          };
        });
      }

      // 3. Nếu có nước cờ và đang bật tự động nhận nước
      if (parsed.move && autoApply) {
        const move = parsed.move;
        // Kiểm tra xem nước cờ có đi từ thế hiện tại được không
        const currentLive = game.history[game.moves.length];
        const legal = legalMovesFrom(currentLive, move.from).some((m) => m.to === move.to);

        if (legal) {
          playMoveSound(currentLive, move);
          dispatch({ type: "move", move });
          tickClock(currentLive, [move]);
          if (clearOnMove) clearDrawings();
          setNotice(`Đã nhận nước cờ từ Ziga: ${moveNotation(currentLive.board, move)}`);
        } else {
          setNotice(
            `Nhận nước cờ ${move.from} → ${move.to} nhưng không hợp lệ ở thế cờ hiện tại. Có thể ván mới đã bắt đầu?`,
          );
        }
      }
    },
    [autoApply, clearDrawings, clearOnMove, game.history, game.moves.length, setStageSettings, tickClock, timeControl],
  );

  // Mở luồng Server-Sent Events nhận dữ liệu từ Ziga Relay
  useEffect(() => {
    let evtSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    function connect() {
      try {
        evtSource = new EventSource("/api/tuong-thuat/ziga-relay");

        evtSource.onopen = () => {
          setSseConnected(true);
        };

        evtSource.addEventListener("init", (event: MessageEvent) => {
          try {
            const list = JSON.parse(event.data) as ZigaRelayPacket[];
            if (Array.isArray(list)) {
              setPackets(list.reverse());
            }
          } catch {}
        });

        evtSource.onmessage = (event: MessageEvent) => {
          try {
            const packet = JSON.parse(event.data) as ZigaRelayPacket;
            handleIncomingPacket(packet);
          } catch {}
        };

        evtSource.onerror = () => {
          setSseConnected(false);
          evtSource?.close();
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch {
        setSseConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      evtSource?.close();
    };
  }, [handleIncomingPacket]);

  // Đồng bộ sang sân khấu OBS (/ws/stage)
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

  const sendStage = stageLink.send;
  const lastCapturedPiece =
    lastMove && ply > 0 ? (game.history[ply - 1].board[lastMove.to] ?? null) : null;

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
        clocks: live ? stageClocks : null,
      }),
    });
  }, [
    sendStage,
    pos,
    ply,
    lastMove,
    checkSquare,
    game.moves,
    sketch.present,
    mySide,
    stageSettings,
    lastCapturedPiece,
    live,
    stageClocks,
  ]);

  // Click ô đi quân bằng tay (hoặc bày lại thế cờ)
  const canMove = live && !drawing;
  const targets = canMove && selected !== null ? legalMovesFrom(livePos, selected).map((m) => m.to) : [];
  const onSquareClick = (i: number) => {
    if (selected !== null && targets.includes(i)) {
      const move = { from: selected, to: i };
      playMoveSound(livePos, move);
      dispatch({ type: "move", move });
      tickClock(livePos, [move]);
      setSelected(null);
      return;
    }
    const piece = livePos.board[i];
    setSelected(piece && sideOf(piece) === livePos.turn && i !== selected ? i : null);
  };

  const onAnnotate = useCallback((from: number, to: number) => draw({ type: "annotate", from, to, color }), [color]);

  const newMatch = () => {
    dispatch({ type: "reset" });
    setViewPly(null);
    setSelected(null);
    clearDrawings();
    setRoundResult(null);
    setNotice("Đã đặt lại bàn cờ về đầu.");
  };

  const undoMove = () => {
    if (game.moves.length === 0) return;
    dispatch({ type: "undo", plies: 1 });
    setViewPly(null);
    setSelected(null);
  };

  const recordResult = (r: StageResult | null) => {
    setStageSettings((s) => ({ ...s, today: changeResult(s.today, roundResult, r) }));
    setRoundResult(r);
    const now = Date.now();
    setClock((prev) => (prev ? stopClock(prev, now) : prev));
  };

  const copyScript = async () => {
    const script = generateTampermonkeyScript(typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    await navigator.clipboard.writeText(script);
    setCopied("script");
    setTimeout(() => setCopied(null), 2500);
  };

  const testSendCustomPacket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTestInput.trim()) return;
    try {
      await fetch("/api/tuong-thuat/ziga-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: "in",
          payload: customTestInput,
        }),
      });
      setCustomTestInput("");
    } catch {}
  };

  const clearHistory = async () => {
    try {
      await fetch("/api/tuong-thuat/ziga-relay?action=clear");
      setPackets([]);
    } catch {}
  };

  // Phân tích thế cờ
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

  // Ghép cặp nước đi cho biên bản
  const pairs = useMemo(() => {
    const rows: { round: number; plies: { ply: number; text: string }[] }[] = [];
    for (let i = 0; i < game.moves.length; i += 2) {
      const plies = [{ ply: i + 1, text: game.moves[i].notation }];
      if (i + 1 < game.moves.length) plies.push({ ply: i + 2, text: game.moves[i + 1].notation });
      rows.push({ round: Math.floor(i / 2) + 1, plies });
    }
    return rows;
  }, [game.moves]);

  return (
    <main className={styles.layout}>
      {/* Thanh chuyển chế độ Tường thuật */}
      <nav aria-label="Chế độ tường thuật" className={zigaStyles.subnav}>
        <Link href="/tuong-thuat" className={zigaStyles.subnavLink}>
          📷 Thị giác máy tính (Chụp màn hình)
        </Link>
        <Link href="/tuong-thuat/ziga" className={`${zigaStyles.subnavLink} ${zigaStyles.subnavActive}`}>
          ⚡ Đồng bộ WebSocket trực tiếp (Ziga Hook)
        </Link>
      </nav>

      {/* Cột bàn cờ */}
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
          sketchColor={color}
          onAnnotate={drawing ? onAnnotate : undefined}
        />

        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.btn}
            aria-pressed={drawing}
            onClick={() => {
              setDrawing((d) => !d);
              setSelected(null);
            }}
          >
            {drawing ? "✏️ Đang vẽ bình luận" : "♟️ Đang đi quân"}
          </button>
          {drawing && (
            <>
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={styles.swatch}
                  style={{ background: c.value }}
                  aria-label={c.label}
                  aria-pressed={color === c.value}
                  onClick={() => setColor(c.value)}
                />
              ))}
              <button type="button" className={styles.btn} onClick={clearDrawings}>
                Xóa nét vẽ
              </button>
            </>
          )}
          <button type="button" className={styles.btn} onClick={() => setFlipped((f) => !f)}>
            🔄 Đổi góc nhìn
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

      {/* Cột bảng điều khiển */}
      <aside className={styles.panel}>
        <StagePanel
          settings={stageSettings}
          setSettings={setStageSettings}
          link={stageLink}
          result={roundResult}
          onResult={recordResult}
          autoRead={false}
          onAutoRead={() => {}}
          clocks={stageClocks}
          mySide={mySide}
          onToggleSide={() => setFlipped((f) => !f)}
        />

        {/* Khối kết nối Ziga WebSocket Hook */}
        <section className={styles.card}>
          <h1 className={styles.title}>Đồng bộ trực tiếp Ziga</h1>

          {/* Thanh trạng thái */}
          <div className={zigaStyles.connectionBar}>
            <div className={zigaStyles.statusIndicator}>
              <span className={`${zigaStyles.dot} ${sseConnected ? zigaStyles.dotGreen : zigaStyles.dotYellow}`} />
              <span>{sseConnected ? "Đang lắng nghe gói tin từ Ziga" : "Đang chờ kết nối tới Relay..."}</span>
            </div>
            <span className={styles.muted}>{packets.length} gói tin</span>
          </div>

          {notice && (
            <p className={styles.warn} role="status">
              {notice}{" "}
              <button type="button" className={styles.btn} onClick={() => setNotice(null)}>
                Đóng
              </button>
            </p>
          )}

          {/* Hộp Tampermonkey script */}
          <div className={zigaStyles.scriptBox}>
            <div className={zigaStyles.scriptBoxTitle}>
              <span>📜 Script bắt gói tin Ziga</span>
              <button type="button" className={styles.btnGold} onClick={copyScript}>
                {copied === "script" ? "✓ Đã sao chép Script" : "📋 Sao chép Script"}
              </button>
            </div>
            <p className={styles.muted}>
              Cài tiện ích <strong>Tampermonkey</strong> trên Chrome, tạo script mới, dán mã này vào rồi mở xem trận đấu trên Ziga.
            </p>
            <div style={{ marginTop: 6 }}>
              <button type="button" className={styles.btn} onClick={() => setShowScript((s) => !s)}>
                {showScript ? "Ẩn mã nguồn script" : "Xem mã nguồn script"}
              </button>
            </div>
            {showScript && (
              <pre className={zigaStyles.scriptCode}>
                {generateTampermonkeyScript(typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")}
              </pre>
            )}
          </div>

          <label className={styles.check}>
            <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />
            Tự động đi quân khi nhận được nước cờ từ Ziga
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={clearOnMove} onChange={(e) => setClearOnMove(e.target.checked)} />
            Tự xóa nét vẽ khi có nước mới
          </label>
        </section>

        {/* Khối Soi Gói Tin Thô (Raw Packet Inspector) */}
        <section className={zigaStyles.inspectorCard}>
          <div className={zigaStyles.inspectorHeader}>
            <span>🔍 Soi gói tin WebSocket (Inspector)</span>
            <div className={styles.row}>
              <button type="button" className={styles.btn} onClick={clearHistory}>
                Xóa log
              </button>
            </div>
          </div>

          <div className={zigaStyles.packetList}>
            {packets.length === 0 ? (
              <p className={styles.muted}>Chưa có gói tin nào. Hãy mở tab Ziga để bắt đầu nhận tin!</p>
            ) : (
              packets.map((p) => (
                <div key={p.id} className={zigaStyles.packetItem}>
                  <div className={zigaStyles.packetMeta}>
                    <span className={p.direction === "in" ? zigaStyles.badgeIn : zigaStyles.badgeOut}>
                      {p.direction === "in" ? "⬇ NHẬN (Ziga → Client)" : "⬆ GỬI (Client → Ziga)"}
                    </span>
                    <span>{new Date(p.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className={zigaStyles.packetSummary}>
                    {p.parsed.summary}
                    {p.parsed.move && <span className={zigaStyles.badgeMove}> (Hợp lệ)</span>}
                  </div>
                  <div className={zigaStyles.packetDetails}>
                    {p.encoding === "base64" && !p.decodedText && "[binary base64] "}
                    {p.decodedText ?? (typeof p.payload === "string" ? p.payload : JSON.stringify(p.payload))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Ô test gửi gói tin thủ công */}
          <form onSubmit={testSendCustomPacket} className={zigaStyles.testForm}>
            <input
              type="text"
              className={zigaStyles.testInput}
              placeholder='Thử gói tin (vd: 42["move",{"from":70,"to":67}] hoặc {"move":"h2e2"})'
              value={customTestInput}
              onChange={(e) => setCustomTestInput(e.target.value)}
            />
            <button type="submit" className={styles.btnGold}>
              Thử
            </button>
          </form>
        </section>

        {/* Biên bản & Thao tác ván */}
        <section className={styles.card}>
          <div className={styles.row}>
            <button type="button" className={styles.btnGold} onClick={openAnalysis}>
              🔍 Phân tích thế cờ
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={undoMove}
              disabled={game.moves.length === 0}
              title="Bỏ nước cờ gần nhất"
            >
              ↶ Lùi 1 nước
            </button>
            <button type="button" className={styles.btn} onClick={newMatch}>
              Ván mới
            </button>
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                void navigator.clipboard.writeText(toFen(pos));
                setCopied("fen");
                setTimeout(() => setCopied(null), 2000);
              }}
            >
              {copied === "fen" ? "✓ Đã chép FEN" : "📋 Chép FEN"}
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={game.moves.length === 0}
              onClick={() => {
                const text = game.moves.map((m, i) => `${i + 1}. ${m.notation}`).join(" ");
                void navigator.clipboard.writeText(text);
                setCopied("moves");
                setTimeout(() => setCopied(null), 2000);
              }}
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
