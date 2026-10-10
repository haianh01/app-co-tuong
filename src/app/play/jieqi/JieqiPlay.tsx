"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { MoveList, PlayerCard, ResultOverlay } from "@/components/game/GamePanels";
import { useSession } from "@/components/session/SessionProvider";
import { useMoveSounds, useResultSound } from "@/hooks/useGameSounds";
import { findKing, type Move, type Piece, type Side } from "@/lib/xiangqi/engine";
import { describeResult, type GameResult } from "@/lib/xiangqi/game";
import { JIEQI_LEVELS, type JieqiLevel } from "@/lib/xiangqi/jieqi-ai";
import {
  isHidden, jieqiEnd, jieqiGameState, jieqiInCheck, jieqiLegalMoves, jieqiPieceIds, jieqiPlay, newJieqi, randomLayout,
  type JieqiState,
} from "@/lib/xiangqi/jieqi";
import styles from "../play.module.css";

interface Game {
  state: JieqiState;
  /** Bố cục bí mật: chỉ dùng để lật quân khi được đi, không đưa cho máy. */
  layout: Record<number, Piece>;
  player: Side;
  level: JieqiLevel;
}

function freshGame(player: Side, level: JieqiLevel): Game {
  return { state: newJieqi(), layout: randomLayout(), player, level };
}

/** Máy chạy trong worker; trả về hàm hỏi nước đi. */
function useJieqiWorker() {
  const ref = useRef<Worker | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL("../../../lib/xiangqi/jieqi-ai.worker.ts", import.meta.url), { type: "module" });
    ref.current = w;
    return () => {
      w.terminate();
      ref.current = null;
    };
  }, []);
  return useCallback((state: JieqiState, level: JieqiLevel) => {
    return new Promise<Move | null>((resolve, reject) => {
      const w = ref.current;
      if (!w) return reject(new Error("Máy chưa sẵn sàng"));
      const id = ++seq.current;
      const onMessage = (e: MessageEvent<{ id: number; move: Move | null }>) => {
        if (e.data.id !== id) return;
        w.removeEventListener("message", onMessage);
        resolve(e.data.move);
      };
      w.addEventListener("message", onMessage);
      w.postMessage({ id, board: state.position.board, turn: state.position.turn, level });
    });
  }, []);
}

export function JieqiPlay() {
  const { user } = useSession();
  const [game, setGame] = useState<Game | null>(null);
  const [draft, setDraft] = useState<{ player: Side; level: JieqiLevel }>({ player: "r", level: 2 });
  const [selected, setSelected] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const think = useJieqiWorker();

  const start = () => {
    setSelected(null);
    setGame(freshGame(draft.player, draft.level));
  };

  const play = useCallback((m: Move) => {
    setGame((g) => {
      if (!g) return g;
      const reveal = isHidden(g.state.position.board[m.from]) ? g.layout[m.from] : undefined;
      const next = jieqiPlay(g.state, { ...m, reveal });
      return next === g.state ? g : { ...g, state: next };
    });
  }, []);

  // Đến lượt máy: hỏi worker (chỉ gửi bàn cờ công khai).
  const aiTurn = !!game && !game.state.result && game.state.position.turn !== game.player;
  const stateForAi = aiTurn ? game.state : null;
  const levelForAi = game?.level ?? 2;
  useEffect(() => {
    if (!stateForAi) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setThinking(true);
      think(stateForAi, levelForAi)
        .then((m) => {
          if (!cancelled && m) play(m);
        })
        .catch(() => {})
        .finally(() => !cancelled && setThinking(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [stateForAi, levelForAi, think, play]);

  const view = game ? jieqiGameState(game.state.moves, game.state.result) : null;
  useMoveSounds(view?.moves ?? []);
  useResultSound(game?.state.result ?? null, game?.player ?? "r");

  if (!game || !view) {
    return (
      <main className={styles.layout}>
        <section className={`card ${styles.panel}`} style={{ maxWidth: 520, width: "100%" }} aria-labelledby="jq-title">
          <span className="seal" style={{ width: 56, height: 56, background: "#2f5d50", writingMode: "vertical-rl" }} aria-hidden="true">揭棋</span>
          <h1 id="jq-title" className={styles.panelTitle} style={{ fontSize: 26 }}>Cờ úp – chơi với máy</h1>
          <p className="muted">
            Ngoài hai tướng, mọi quân được úp và xáo ngẫu nhiên. Quân úp đi theo quân của ô xuất phát (ô Mã thì đi như Mã),
            đi rồi mới lật ra quân thật. Sĩ, tượng đã lật được đi khắp bàn. Máy không nhìn trộm quân úp.
          </p>
          <fieldset className={styles.field}>
            <legend>Bạn cầm quân</legend>
            <div className={styles.segments}>
              <button type="button" className={styles.segment} aria-pressed={draft.player === "r"} onClick={() => setDraft({ ...draft, player: "r" })}>Đỏ (đi trước)</button>
              <button type="button" className={styles.segment} aria-pressed={draft.player === "b"} onClick={() => setDraft({ ...draft, player: "b" })}>Đen</button>
            </div>
          </fieldset>
          <fieldset className={styles.field}>
            <legend>Độ khó</legend>
            <div className={styles.segments}>
              {JIEQI_LEVELS.map((l) => (
                <button key={l.level} type="button" className={styles.segment} aria-pressed={draft.level === l.level} onClick={() => setDraft({ ...draft, level: l.level })}>
                  {l.name}
                </button>
              ))}
            </div>
          </fieldset>
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={start}>Bắt đầu</button>
            <Link href="/online?variant=jieqi" className="btn">Chơi cờ úp với người</Link>
          </div>
        </section>
      </main>
    );
  }

  const pos = game.state.position;
  const result: GameResult | null = game.state.result;
  const ai: Side = game.player === "r" ? "b" : "r";
  const myTurn = !result && pos.turn === game.player;
  const targets = myTurn && selected !== null ? jieqiLegalMoves(pos).filter((m) => m.from === selected).map((m) => m.to) : [];
  const checkSquare = jieqiInCheck(pos.board, pos.turn) ? findKing(pos.board, pos.turn) : null;
  const last = game.state.moves.at(-1) ?? null;
  const outcome = result ? describeResult(result, game.player) : null;
  const capturedBy = (s: Side) => view.moves.filter((m) => m.side === s && m.captured).map((m) => m.captured!);

  const onSquareClick = (i: number) => {
    if (!myTurn) return;
    const p = pos.board[i];
    if (p && (p === p.toUpperCase() ? "r" : "b") === game.player) {
      setSelected(selected === i ? null : i);
      return;
    }
    if (selected !== null && targets.includes(i)) play({ from: selected, to: i });
    setSelected(null);
  };

  const resign = () => setGame((g) => (g ? { ...g, state: jieqiEnd(g.state, { winner: ai, reason: "resign" }) } : g));
  const levelName = JIEQI_LEVELS.find((l) => l.level === game.level)!.name;

  return (
    <main className={styles.layout}>
      <div className={styles.side}>
        <PlayerCard
          className={styles.opp}
          name={`Máy · ${levelName}`}
          subtitle={`Cầm quân ${ai === "r" ? "Đỏ" : "Đen"}`}
          avatar="機"
          avatarHan
          clock={null}
          clockActive={false}
          clockLow={false}
          captured={capturedBy(ai)}
        />
        <div className={`card ${styles.status}`} role="status">
          <strong>{outcome ? outcome.title : thinking || !myTurn ? "Máy đang suy nghĩ…" : checkSquare !== null ? "Bạn đang bị chiếu!" : "Đến lượt bạn"}</strong>
          {checkSquare !== null && !result && <span className={styles.checkSeal}>將軍</span>}
          {!result && <span className="muted">Quân úp đi theo quân của ô xuất phát; đi xong sẽ lật.</span>}
        </div>
        <PlayerCard
          className={styles.me}
          name="Bạn"
          subtitle={`Cầm quân ${game.player === "r" ? "Đỏ" : "Đen"}`}
          avatar="我"
          avatarId={user ? user.avatar : undefined}
          frameId={user ? user.frame : undefined}
          avatarHan
          highlight
          clock={null}
          clockActive={false}
          clockLow={false}
          captured={capturedBy(game.player)}
        />
      </div>

      <section className={styles.center} aria-label="Bàn cờ">
        <XiangqiBoard
          board={pos.board}
          ids={jieqiPieceIds(game.state.moves)}
          orientation={game.player}
          selected={selected}
          targets={targets}
          lastMove={last ? { from: last.from, to: last.to } : null}
          checkSquare={checkSquare}
          disabled={!myTurn}
          onSquareClick={onSquareClick}
        >
          {outcome && (
            <ResultOverlay seal={outcome.seal} title={outcome.title} detail={outcome.detail}>
              <button type="button" className="btn btn-primary" onClick={start}>Ván mới</button>
              <button type="button" className="btn" onClick={() => setGame(null)}>Đổi thiết lập</button>
            </ResultOverlay>
          )}
        </XiangqiBoard>
      </section>

      <div className={styles.side}>
        <div className={`card ${styles.panel} ${styles.controls}`}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Biên bản</h2>
            <span className="muted">{game.state.moves.length} nửa nước</span>
          </div>
          <MoveList moves={view.moves} />
          <div className={styles.actions}>
            <button type="button" className="btn btn-danger" disabled={!!result} onClick={resign}>Xin thua</button>
            <button type="button" className="btn btn-primary" onClick={start}>Ván mới</button>
            <button type="button" className="btn" onClick={() => setGame(null)}>Đổi thiết lập</button>
          </div>
        </div>
      </div>
    </main>
  );
}
