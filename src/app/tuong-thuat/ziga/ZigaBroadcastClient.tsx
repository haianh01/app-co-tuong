"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
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
import { changeResult, nextRound, resultOnBoard, type StageResult } from "../stage-round";
import { useStageArchive } from "../useStageArchive";
import { clockAfterMove, readClock, startClock, stopClock, type GameClock } from "../game-clock";
import { buildStageState, canReview, type StageClocks, type StagePuzzleState, type StageReviewState } from "../stage-sync";
import { TrialBar, useTrialMoves } from "../trial";
import { scrollMoveIntoBox } from "../scroll-moves";
import { generateTampermonkeyScript } from "@/lib/ziga/tampermonkey-script";
import type { ZigaReplay } from "@/lib/ziga/ziga-replay";
import type { ZigaPlayer, ZigaSelection } from "@/lib/ziga/ziga-parser";
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

type BroadcastAction = GameAction | { type: "reset"; fen?: string };

const START_POSITION = newGame().history[0];

const sameMove = (a: Move | null | undefined, b: Move) => !!a && a.from === b.from && a.to === b.to;

/** "Bạn" / "Đối thủ" nếu biết ghế của mình, không thì "Đỏ" / "Đen", cuối cùng là số ghế. */
function seatLabel(seat: number, seats: { red: number; black: number } | null, mySeat: number | null): string {
  if (mySeat !== null) return seat === mySeat ? "Bạn" : "Đối thủ";
  if (seats) return seat === seats.red ? "Đỏ" : "Đen";
  return `Ghế ${seat}`;
}

function broadcastReducer(state: GameState, action: BroadcastAction): GameState {
  if (action.type === "reset") return newGame(action.fen);
  if (action.type === "move" && state.result) return gameReducer({ ...state, result: null }, action);
  return gameReducer(state, action);
}

export function ZigaBroadcastClient() {
  const [game, dispatch] = useReducer(broadcastReducer, undefined, () => newGame());
  // Bản sao đồng bộ của game: nhiều gói tới sát nhau vẫn đọc đúng thế cờ mới nhất (không chờ re-render)
  const gameRef = useRef(game);
  useLayoutEffect(() => {
    gameRef.current = game;
  }, [game]);
  const applyGameAction = useCallback((action: BroadcastAction) => {
    gameRef.current = broadcastReducer(gameRef.current, action);
    dispatch(action);
  }, []);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [stageReview, setStageReview] = useState<StageReviewState | null>(null);
  const [stagePuzzle, setStagePuzzle] = useState<StagePuzzleState | null>(null);

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
  const roundResultRef = useRef(roundResult);
  useLayoutEffect(() => {
    roundResultRef.current = roundResult;
  }, [roundResult]);
  const [autoApply, setAutoApply] = useState(true);
  // Đang phát lại các gói của ván dở lúc mở trang: không kêu tiếng, không ghi thêm kết quả, dùng giờ gốc của gói
  const replayingRef = useRef(false);

  // Trạng thái kết nối SSE tới relay
  const [sseConnected, setSseConnected] = useState(false);
  const [packets, setPackets] = useState<ZigaRelayPacket[]>([]);
  const [customTestInput, setCustomTestInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // Quân người dẫn đang chọn trên Ziga + chấm nước (script đọc từ engine Cocos)
  const [zigaSelection, setZigaSelection] = useState<ZigaSelection | null>(null);
  // Bàn Ziga có 2 ghế (0 | 1). Ghế nào cầm Đỏ biết từ gói bắt đầu ván; ghế của mình biết từ nước mình gửi đi.
  const [readySeats, setReadySeats] = useState<Record<number, boolean>>({});
  const [seats, setSeats] = useState<{ red: number; black: number } | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const seatsRef = useRef(seats);
  const mySeatRef = useRef(mySeat);
  // Vừa bấm "Sẵn sàng" trên Ziga → gói 0x2c sẵn sàng kế tiếp là của ghế mình
  const pendingReadyRef = useRef(false);
  // Tên tài khoản của người dẫn (gói đăng nhập) + người đang ngồi ở từng ghế (tên, elo)
  const myNameRef = useRef<string | null>(null);
  const rosterRef = useRef<Record<number, ZigaPlayer>>({});
  const archiveRef = useRef<ReturnType<typeof useStageArchive> | null>(null);

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
    (before: Position, moves: Move[], now = Date.now()) => {
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
  // Chỉ hiện quân chọn của Ziga khi đang xem thế cờ mới nhất và quân đó thực sự nằm ở ô ấy
  const liveZigaSelection =
    live && zigaSelection?.from != null && livePos.board[zigaSelection.from] ? zigaSelection : null;
  const liveNotations = useMemo(() => game.moves.map((m) => m.notation), [game.moves]);
  const trial = useTrialMoves(liveNotations);
  // Trạng thái sẵn sàng cho sân khấu: chỉ khi đang chờ ván (ván bắt đầu thì xoá) và đã biết ghế của mình
  const stageReady = useMemo(
    () =>
      mySeat === null || Object.keys(readySeats).length === 0
        ? null
        : { me: readySeats[mySeat] ?? false, opponent: readySeats[1 - mySeat] ?? false },
    [mySeat, readySeats],
  );

  const orientation: Side = flipped ? "b" : "r";
  const mySide: Side = orientation;
  const oppSide: Side = mySide === "r" ? "b" : "r";
  const isGameOver = Boolean(
    game.result ||
    roundResult ||
    (game.moves.length > 0 && resultOnBoard(game.history[game.moves.length], mySide))
  );
  // Pure anti-cheat: chỉ kích hoạt review / puzzle lên sân khấu nếu thỏa mãn quy tắc an toàn
  const canOperate = canReview(isGameOver, game.moves.length);
  const activeReview = stageReview && canOperate ? stageReview : null;
  const activePuzzle = stagePuzzle && canOperate ? stagePuzzle : null;

  const handleUpdateReview = useCallback(
    (rev: StageReviewState | null) => {
      if (rev && !canReview(isGameOver, game.moves.length)) {
        return;
      }
      if (rev) setStagePuzzle(null);
      setStageReview(rev);
    },
    [isGameOver, game.moves.length],
  );

  const handleUpdatePuzzle = useCallback(
    (puz: StagePuzzleState | null) => {
      if (puz && !canReview(isGameOver, game.moves.length)) {
        return;
      }
      if (puz) setStageReview(null);
      setStagePuzzle(puz);
    },
    [isGameOver, game.moves.length],
  );

  // Xử lý gói tin khi nhận được từ Ziga Relay
  const handleIncomingPacket = useCallback(
    (packet: ZigaRelayPacket) => {
      const replaying = replayingRef.current;
      // Phát lại thì tính đồng hồ theo lúc gói thật sự tới, để giờ còn lại khớp Ziga
      const now = replaying ? packet.timestamp : Date.now();
      if (!replaying) setPackets((prev) => [packet, ...prev].slice(0, 50));
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

      // 3. Trạng thái bàn: sẵn sàng, bắt đầu ván, chiếu/hết giờ/đầu hàng, kết thúc ván
      if (packet.direction === "out" && parsed.eventType === "ready_sent") pendingReadyRef.current = true;

      // Tên, elo hai bên: gói đăng nhập cho tên mình, gói thông tin bàn / vào / rời bàn / elo sau ván cho từng ghế
      let rosterChanged = false;
      if (parsed.login) {
        myNameRef.current = parsed.login.userName;
        rosterChanged = true;
      }
      if (parsed.roster) {
        const next: Record<number, ZigaPlayer> = parsed.roster.replace ? {} : { ...rosterRef.current };
        for (const p of parsed.roster.list) next[p.seat] = p;
        rosterRef.current = next;
        rosterChanged = true;
      }
      if (parsed.playerLeave) {
        const next = { ...rosterRef.current };
        delete next[parsed.playerLeave.seat];
        rosterRef.current = next;
        rosterChanged = true;
      }
      if (parsed.eloUpdate) {
        const cur = rosterRef.current[parsed.eloUpdate.seat];
        if (cur) {
          rosterRef.current = { ...rosterRef.current, [cur.seat]: { ...cur, elo: parsed.eloUpdate.elo } };
          rosterChanged = true;
        }
      }
      if (rosterChanged) {
        const roster = rosterRef.current;
        const mine = Object.values(roster).find((p) => p.name === myNameRef.current);
        if (mine && mySeatRef.current !== mine.seat) {
          mySeatRef.current = mine.seat;
          setMySeat(mine.seat);
        }
        const seat = mySeatRef.current;
        if (seat !== null) {
          const me = roster[seat];
          const opp = roster[1 - seat];
          setStageSettings((st) => ({
            ...st,
            me: me ? { ...st.me, name: me.name, points: String(me.elo) } : st.me,
            opponent: opp ? { ...st.opponent, name: opp.name, points: String(opp.elo) } : { name: "Đối thủ" },
          }));
        }
      }

      // Vào bàn giữa ván: Ziga gửi nguyên thế cờ → bày lại bàn (nếu khác), lấy giờ hai bên, biết ghế Đỏ/Đen
      if (parsed.tableSnapshot) {
        const snap = parsed.tableSnapshot;
        const nextSeats = { red: snap.redSeat, black: snap.blackSeat };
        seatsRef.current = nextSeats;
        setSeats(nextSeats);
        setReadySeats({});
        const fen = toFen({ board: snap.board, turn: snap.turn });
        const current = gameRef.current;
        if (toFen(current.history[current.moves.length]) !== fen) {
          applyGameAction({ type: "reset", fen });
          setViewPly(null);
          setSelected(null);
          setZigaSelection(null);
          clearDrawings();
          setNotice("Đã vào bàn giữa ván — bày lại thế cờ đang diễn ra trên Ziga.");
        }
        setClock(startClock(timeControl, snap.turn, now, { r: snap.redRemainingSec * 1000, b: snap.blackRemainingSec * 1000 }));
        const seat = mySeatRef.current;
        if (seat !== null) setFlipped(seat === snap.blackSeat);
      }

      if (parsed.timeControl) {
        const totalMin = parsed.timeControl.totalSec / 60;
        const perMoveSec = parsed.timeControl.perMoveSec;
        setStageSettings((st) =>
          st.timeControl.totalMin === totalMin && st.timeControl.perMoveSec === perMoveSec
            ? st
            : { ...st, timeControl: { totalMin, perMoveSec } },
        );
      }

      if (parsed.playerStatus) {
        const { seat, ready } = parsed.playerStatus;
        setReadySeats((prev) => ({ ...prev, [seat]: ready }));
        if (ready && pendingReadyRef.current) {
          pendingReadyRef.current = false;
          if (mySeatRef.current !== seat) {
            mySeatRef.current = seat;
            setMySeat(seat);
          }
        }
      }

      if (parsed.gameStart) {
        const { redSeat, blackSeat } = parsed.gameStart;
        const next = { red: redSeat, black: blackSeat };
        seatsRef.current = next;
        setSeats(next);
        setReadySeats({});
        // Ván trước đã có nước → sang ván kế (tăng số ván, xoá tên đối thủ cũ)
        if (gameRef.current.moves.length > 0) {
          void archiveRef.current?.saveNow(roundResultRef.current, roundResultRef.current ? "manual" : null);
          setStageSettings((s) => nextRound(s, roundResultRef.current, null));
          archiveRef.current?.newGame();
        }
        applyGameAction({ type: "reset" });
        setViewPly(null);
        setSelected(null);
        setZigaSelection(null);
        setRoundResult(null);
        roundResultRef.current = null;
        // Đỏ đi trước: đồng hồ Đỏ chạy ngay khi ván bắt đầu
        setClock(startClock(timeControl, "r", now));
        clearDrawings();
        const seat = mySeatRef.current;
        if (seat !== null) setFlipped(seat === blackSeat);
        setNotice(
          seat === null
            ? "Ván mới bắt đầu trên Ziga."
            : `Ván mới bắt đầu — bạn cầm ${seat === redSeat ? "Đỏ (đi trước)" : "Đen"}.`,
        );
      }

      // Nước mình gửi đi (chưa xác nhận): lúc này đang tới lượt mình → biết mình ngồi ghế nào
      if (packet.direction === "out" && parsed.eventType === "move_sent" && seatsRef.current) {
        const turn = gameRef.current.history[gameRef.current.moves.length].turn;
        const seat = turn === "r" ? seatsRef.current.red : seatsRef.current.black;
        if (mySeatRef.current !== seat) {
          mySeatRef.current = seat;
          setMySeat(seat);
          setFlipped(turn === "b");
        }
      }

      if (parsed.gameEvent && parsed.gameEvent.reason !== "check") {
        const { reason, seat } = parsed.gameEvent;
        const who = seatLabel(seat, seatsRef.current, mySeatRef.current);
        const what = { checkmate: "chiếu hết", timeout: "hết giờ", resign: "đầu hàng", other: "phạm luật", check: "chiếu" }[reason];
        setNotice(`${who}: ${what}.`);
      }

      if (parsed.gameEnd) {
        const { winnerSeat } = parsed.gameEnd;
        const s = seatsRef.current;
        setClock((prev) => (prev ? stopClock(prev, now) : prev));
        if (winnerSeat === null || s) {
          const winnerSide: Side | null = winnerSeat === null ? null : winnerSeat === s?.red ? "r" : "b";
          // Biết ghế mình thì lấy bên theo ghế (lúc phát lại, mySide của lần render trước có thể chưa kịp đổi)
          const seat = mySeatRef.current;
          const meSide: Side = seat !== null && s ? (seat === s.red ? "r" : "b") : mySide;
          const result: StageResult = winnerSide === null ? "draw" : winnerSide === meSide ? "win" : "loss";
          const previous = roundResultRef.current;
          // Ván đã kết thúc trước khi reload thì thành tích hôm nay (lưu trong máy) đã có kết quả này rồi
          if (!replaying) setStageSettings((st) => ({ ...st, today: changeResult(st.today, previous, result) }));
          roundResultRef.current = result;
          setRoundResult(result);
          setNotice(
            `Ván kết thúc — ${winnerSide === null ? "hoà" : `${winnerSide === "r" ? "Đỏ" : "Đen"} thắng`} (đã ghi: ${
              { win: "thắng", draw: "hoà", loss: "thua" }[result]
            }).`,
          );
        } else {
          setNotice(`Ván kết thúc — ghế ${winnerSeat} thắng (chưa biết ghế nào cầm Đỏ nên chưa tự ghi kết quả).`);
        }
      }

      // 4. Quân đang chọn trên Ziga
      if (parsed.selection) {
        setZigaSelection(parsed.selection.from === null ? null : parsed.selection);
      }

      // 5. Nếu có nước cờ và đang bật tự động nhận nước
      if (parsed.move && autoApply) {
        const move = parsed.move;
        const current = gameRef.current;
        const currentLive = current.history[current.moves.length];

        // Ziga hay gửi lại đúng nước vừa đi (gói out của mình + gói in xác nhận) → bỏ qua
        if (sameMove(current.moves.at(-1)?.move, move)) return;

        if (legalMovesFrom(currentLive, move.from).some((m) => m.to === move.to)) {
          if (!replaying) playMoveSound(currentLive, move);
          applyGameAction({ type: "move", move });
          setZigaSelection(null);
          tickClock(currentLive, [move], now);
          // Lấy giờ còn lại của bên vừa đi theo server Ziga, để đồng hồ sân khấu khớp Ziga không bị trôi
          const remainingSec = parsed.moverRemainingSec;
          if (remainingSec !== undefined && remainingSec >= 0) {
            const mover = currentLive.turn;
            setClock((prev) => (prev ? { ...prev, remaining: { ...prev.remaining, [mover]: remainingSec * 1000 } } : prev));
          }
          if (clearOnMove) clearDrawings();
          setNotice(`Đã nhận nước cờ từ Ziga: ${moveNotation(currentLive.board, move)}`);
        } else if (current.moves.length > 0 && legalMovesFrom(START_POSITION, move.from).some((m) => m.to === move.to)) {
          // Không đi được từ thế hiện tại nhưng là nước mở đầu hợp lệ → ván mới đã bắt đầu
          applyGameAction({ type: "reset" });
          applyGameAction({ type: "move", move });
          setZigaSelection(null);
          setViewPly(null);
          setSelected(null);
          setRoundResult(null);
          setClock(null);
          tickClock(START_POSITION, [move], now);
          clearDrawings();
          if (!replaying) playMoveSound(START_POSITION, move);
          setNotice(`Phát hiện ván mới — đã đặt lại bàn và nhận nước: ${moveNotation(START_POSITION.board, move)}`);
        } else {
          setNotice(`Nhận nước cờ ${move.from} → ${move.to} nhưng không hợp lệ ở thế cờ hiện tại.`);
        }
      }
    },
    [applyGameAction, autoApply, clearDrawings, clearOnMove, mySide, oppSide, setStageSettings, tickClock, timeControl],
  );

  // Luôn trỏ tới handler mới nhất để EventSource không phải đóng/mở lại mỗi khi state đổi
  const handlerRef = useRef(handleIncomingPacket);
  useLayoutEffect(() => {
    handlerRef.current = handleIncomingPacket;
  }, [handleIncomingPacket]);
  // seq lớn nhất đã xử lý — chống xử lý trùng khi server phát bù lúc nối lại
  const lastSeqRef = useRef(0);

  // Mở luồng Server-Sent Events nhận dữ liệu từ Ziga Relay (một lần cho cả vòng đời trang)
  useEffect(() => {
    let evtSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      // Nối lại thủ công thì kèm mốc để server phát bù; trình duyệt tự nối lại thì đã có Last-Event-ID
      const since = lastSeqRef.current > 0 ? `?since=${lastSeqRef.current}` : "";
      evtSource = new EventSource(`/api/tuong-thuat/ziga-relay${since}`);

      evtSource.onopen = () => setSseConnected(true);

      evtSource.addEventListener("init", (event: MessageEvent) => {
        try {
          const init = JSON.parse(event.data) as {
            lastSeq: number;
            packets: ZigaRelayPacket[];
            replay?: ZigaReplay<ZigaRelayPacket>;
          };
          lastSeqRef.current = init.lastSeq;
          setPackets([...init.packets].reverse());
          // Trang vừa mở (reload giữa ván): phát lại các gói của ván đang dở mà relay còn giữ để bày lại thế cờ
          const replay = init.replay;
          if (replay && gameRef.current.moves.length === 0) {
            replayingRef.current = true;
            try {
              for (const p of replay.packets) handlerRef.current(p);
            } finally {
              replayingRef.current = false;
            }
            if (replay.anchored && replay.moves > 0) {
              setNotice(`Đã khôi phục ván đang dở từ relay: ${gameRef.current.moves.length} nước, khớp thế cờ trên Ziga.`);
            } else if (replay.orphanMoves) {
              setNotice(
                "Relay không còn giữ đầu ván này nên chưa bày lại được thế cờ. Vào lại bàn trên Ziga (F5 tab Ziga) để Ziga gửi nguyên thế cờ.",
              );
            }
          }
        } catch {}
      });

      evtSource.onmessage = (event: MessageEvent) => {
        try {
          const packet = JSON.parse(event.data) as ZigaRelayPacket;
          if (packet.seq <= lastSeqRef.current) return;
          lastSeqRef.current = packet.seq;
          handlerRef.current(packet);
        } catch {}
      };

      evtSource.onerror = () => {
        setSseConnected(false);
        // CONNECTING: trình duyệt đang tự nối lại (giữ Last-Event-ID). CLOSED: phải tự mở lại.
        if (evtSource?.readyState === EventSource.CLOSED && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 2000);
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      evtSource?.close();
    };
  }, []);

  // Đồng bộ sang sân khấu OBS (/ws/stage)
  const stageClocks = useMemo((): StageClocks | null => {
    if (!clock) return null;
    const sentAt = clock.since;
    const v = readClock(clock, sentAt);
    return {
      me: v.total[mySide],
      opponent: v.total[oppSide],
      running: clock.running === null ? null : clock.running === mySide ? "me" : "opponent",
      perMove: v.perMove,
      perMoveTotal: clock.control.perMoveMs,
      sentAt,
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
        moves: game.moves.map((m, idx) => ({
          ply: idx + 1,
          notation: m.notation,
          side: m.side,
          from: m.move.from,
          to: m.move.to,
        })),
        arrows: sketch.present.arrows,
        highlights: sketch.present.marks,
        selected: liveZigaSelection?.from ?? null,
        targets: liveZigaSelection?.targets ?? [],
        ready: stageReady,
        mySide,
        settings: stageSettings,
        capturedPiece: lastCapturedPiece,
        clocks: live ? stageClocks : null,
        review: activeReview,
        puzzle: activePuzzle,
        // Đi thử: bàn cờ là biến thử, còn lượt đi / đồng hồ vẫn của ván thật đang chạy ngầm.
        ...(trial.stage && { ...trial.stage, turn: livePos.turn, ply: game.moves.length, capturedPiece: null, clocks: stageClocks }),
      }),
    });
  }, [
    trial.stage,
    livePos.turn,
    activeReview,
    activePuzzle,
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
    liveZigaSelection,
    stageReady,
  ]);

  // Click ô đi quân bằng tay (hoặc bày lại thế cờ)
  const canMove = live && !drawing;
  const targets = canMove && selected !== null ? legalMovesFrom(livePos, selected).map((m) => m.to) : [];
  const onSquareClick = (i: number) => {
    if (selected !== null && targets.includes(i)) {
      const move = { from: selected, to: i };
      playMoveSound(livePos, move);
      applyGameAction({ type: "move", move });
      tickClock(livePos, [move]);
      setSelected(null);
      return;
    }
    const piece = livePos.board[i];
    setSelected(piece && sideOf(piece) === livePos.turn && i !== selected ? i : null);
  };
  // Thoát đi thử thì trả chế độ vẽ về như trước (tắt vẽ thì bấm bàn cờ là đi thật).
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

  const onBoard = resultOnBoard(game.history[game.moves.length], mySide);
  const fens = useMemo(() => game.history.map(toFen), [game.history]);
  const archive = useStageArchive({
    room: stageLink.room,
    site: "ziga",
    round: stageSettings.round,
    mySide,
    me: stageSettings.me,
    opponent: stageSettings.opponent,
    moves: game.moves,
    fens,
    roundResult,
    onBoardResult: onBoard,
  });
  useEffect(() => {
    archiveRef.current = archive;
  }, [archive]);

  const onAnnotate = useCallback((from: number, to: number) => draw({ type: "annotate", from, to, color }), [color]);

  /** Hết ván (có nước đi): tự ghi kết quả nếu bàn cờ đã phân thắng thua mà chưa bấm, rồi sang ván sau. */
  const finishRound = () => {
    if (game.moves.length === 0) return;
    const currentOnBoard = resultOnBoard(game.history[game.moves.length], mySide);
    void archive.saveNow(roundResult ?? currentOnBoard, roundResult ? "manual" : currentOnBoard ? "board" : null);
    setStageSettings((s) => nextRound(s, roundResult, currentOnBoard));
    setRoundResult(null);
  };

  const newMatch = () => {
    finishRound();
    archive.newGame();
    applyGameAction({ type: "reset" });
    setViewPly(null);
    setSelected(null);
    setZigaSelection(null);
    clearDrawings();
    setClock(null);
    setNotice("Đã đặt lại bàn cờ về đầu.");
  };

  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // Tự cuộn biên bản tới nước đang xem
  useEffect(() => {
    scrollMoveIntoBox(movesContainerRef.current, activePlyRef.current);
  }, [ply, game.moves.length]);

  // Phím tắt giống chế độ thị giác máy tính
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
      if (e.key === " ") {
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
      if (["1", "2", "3", "4"].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (COLORS[idx]) setColor(COLORS[idx].value);
        return;
      }
      if (e.key === "Escape" || key === "c") clearDrawings();
      else if (e.key === "ArrowLeft") setViewPly((v) => Math.max(0, (v ?? game.moves.length) - 1));
      else if (e.key === "ArrowRight") setViewPly((v) => (v === null || v + 1 >= game.moves.length ? null : v + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearDrawings, game.moves.length]);

  const undoMove = () => {
    if (game.moves.length === 0) return;
    applyGameAction({ type: "undo", plies: 1 });
    setViewPly(null);
    setSelected(null);
  };

  const recordResult = (r: StageResult | null) => {
    setStageSettings((s) => ({ ...s, today: changeResult(s.today, roundResult, r) }));
    setRoundResult(r);
    const now = Date.now();
    setClock((prev) => (prev ? stopClock(prev, now) : prev));
    if (r) {
      void archive.saveNow(r, "manual");
    }
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
        <Link href="/tuong-thuat/lich-su" className={zigaStyles.subnavLink}>
          📜 Lịch sử ván đấu
        </Link>
      </nav>

      {/* Cột bàn cờ */}
      <div ref={boardColRef} className={styles.boardCol}>
        <XiangqiBoard
          board={trial.stage?.board ?? pos.board}
          orientation={orientation}
          lastMove={trial.stage ? trial.stage.lastMove : lastMove}
          checkSquare={trial.stage ? trial.stage.checkSquare : checkSquare}
          selected={trial.stage ? trial.stage.selected : (liveZigaSelection?.from ?? (canMove ? selected : null))}
          targets={trial.stage ? trial.stage.targets : (liveZigaSelection?.targets ?? targets)}
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
          archive={archive}
          review={activeReview}
          onUpdateReview={handleUpdateReview}
          puzzle={activePuzzle}
          onUpdatePuzzle={handleUpdatePuzzle}
          canOperatePuzzle={canOperate}
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
          {Object.keys(readySeats).length > 0 && (
            <div className={zigaStyles.readyBar} aria-label="Trạng thái sẵn sàng">
              {[0, 1].map((seat) => (
                <span key={seat} className={readySeats[seat] ? zigaStyles.readyOn : zigaStyles.readyOff}>
                  {seatLabel(seat, seats, mySeat)}: {readySeats[seat] ? "✓ Sẵn sàng" : "… chưa sẵn sàng"}
                </span>
              ))}
            </div>
          )}

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
                      {p.direction === "in"
                        ? "⬇ NHẬN (Ziga → Client)"
                        : p.direction === "ui"
                          ? "🖱 GIAO DIỆN (bàn cờ Ziga)"
                          : "⬆ GỬI (Client → Ziga)"}
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
                const text = pairs.map((p) => `${p.round}. ${p.plies.map((x) => x.text).join(" ")}`).join("\n");
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
