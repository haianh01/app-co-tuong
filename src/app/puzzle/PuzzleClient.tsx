"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { getHint, loadPuzzleState, submitPuzzleSolution } from "@/app/actions/economy";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { ResultOverlay } from "@/components/game/GamePanels";
import { useSession } from "@/components/session/SessionProvider";
import { Move, applyMove, findKing, inCheck, legalMovesFrom, outcome, parseFen, sideOf } from "@/lib/xiangqi/engine";
import { lineMoveOk, moveWins, toughestReply } from "@/lib/xiangqi/mate";
import { moveNotation } from "@/lib/xiangqi/notation";
import type { StagePuzzleLive } from "@/app/tuong-thuat/stage-puzzle";
import { FREE_HINT_CHAPTER, PUZZLES, type Puzzle } from "@/lib/xiangqi/puzzles";
import { playSound } from "@/lib/sound";
import { PuzzleLivePanel, usePuzzleLive } from "./PuzzleLivePanel";
import styles from "./puzzle.module.css";

type Status = "play" | "reply" | "wrong" | "solved";

const CHAPTERS = [...new Set(PUZZLES.map((p) => p.chapter))].map((name) => ({
  name,
  items: PUZZLES.map((p, i) => ({ p, i })).filter(({ p }) => p.chapter === name),
}));

const starText = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

export function PuzzleClient() {
  const { user } = useSession();
  const member = !!user && !user.isGuest;
  // Phiên đăng nhập chỉ gửi vipUntil khi VIP còn hạn.
  const vip = !!user?.vipUntil;
  const [index, setIndex] = useState(0);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [hints, setHints] = useState<string[]>([]);
  // Chế độ chiếu lên livestream: kết nối sân khấu và thế đang chiếu giữ ở đây, vì PuzzleBoard bị dựng lại mỗi khi đổi thế.
  const [live, setLive] = useState(false);
  const puzzle = PUZZLES[index];
  const stage = usePuzzleLive(live, puzzle);
  const locked = !!puzzle.vip && !vip;

  useEffect(() => {
    if (!member) return;
    let live = true;
    loadPuzzleState().then((s) => {
      if (!live || !s) return;
      setStars((cur) => ({ ...s.stars, ...cur }));
      setHints(s.hints);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [member]);

  const solvedCount = PUZZLES.filter((p) => stars[p.id]).length;

  return (
    <main className={styles.layout}>
      <nav aria-label="Danh sách thế cờ" className={`card ${styles.list}`}>
        <p className="muted">Đã giải {solvedCount}/{PUZZLES.length} thế</p>
        {CHAPTERS.map((ch) => (
          <div key={ch.name} className={styles.chapter}>
            <h2 className={styles.listTitle}>
              {ch.name}
              {ch.items[0].p.vip && <span className={styles.vip}>VIP</span>}
            </h2>
            {ch.items.map(({ p, i }) => (
              <button
                key={p.id}
                type="button"
                className={styles.item}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setIndex(i)}
              >
                <span className={`seal ${styles.itemSeal}`} data-done={stars[p.id] ? true : undefined}>{i + 1}</span>
                <span className={styles.itemText}>
                  <strong>{p.title}</strong>
                  <span className="muted">
                    {stars[p.id] ? <>Đã giải <span className={styles.stars} aria-label={`${stars[p.id]} sao`}>{starText(stars[p.id])}</span></> : p.vip && !vip ? "Dành cho VIP" : "Chưa giải"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <PuzzleBoard
        key={puzzle.id}
        puzzle={puzzle}
        index={index}
        locked={locked}
        live={live}
        onToggleLive={() => setLive((v) => !v)}
        onLiveState={stage.report}
        livePanel={live && !locked ? <PuzzleLivePanel puzzleId={puzzle.id} stage={stage} /> : null}
        member={member}
        hintOwned={hints.includes(puzzle.id)}
        onHintBought={() => setHints((h) => [...h, puzzle.id])}
        onSolved={(n) => setStars((s) => ({ ...s, [puzzle.id]: Math.max(s[puzzle.id] ?? 0, n) }))}
        onNext={index < PUZZLES.length - 1 ? () => setIndex(index + 1) : undefined}
      />
    </main>
  );
}

interface BoardProps {
  puzzle: Puzzle;
  index: number;
  locked: boolean;
  live: boolean;
  onToggleLive: () => void;
  livePanel: ReactNode;
  /** Báo trạng thái bàn giải cho sân khấu livestream (chỉ gọi khi đang bật live). */
  onLiveState: (state: StagePuzzleLive) => void;
  member: boolean;
  hintOwned: boolean;
  onHintBought: () => void;
  onSolved: (stars: number) => void;
  onNext?: () => void;
}

const startIds = (fen: string) => parseFen(fen).board.map((p, i) => (p ? i : null));

function PuzzleBoard({ puzzle, index, locked, live, onToggleLive, livePanel, onLiveState, member, hintOwned, onHintBought, onSolved, onNext }: BoardProps) {
  const { refresh } = useSession();
  const [pos, setPos] = useState(() => parseFen(puzzle.fen));
  const [ids, setIds] = useState(() => startIds(puzzle.fen));
  const [line, setLine] = useState<Move[]>([]);
  const [status, setStatus] = useState<Status>("play");
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reward, setReward] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const freeHint = puzzle.chapter === FREE_HINT_CHAPTER;

  useEffect(() => () => clearTimeout(timer.current), []);

  const reset = () => {
    clearTimeout(timer.current);
    setPos(parseFen(puzzle.fen));
    setIds(startIds(puzzle.fen));
    setLine([]);
    setStatus("play");
    setSelected(null);
    setLastMove(null);
    setReward(null);
  };

  const targets = selected !== null ? legalMovesFrom(pos, selected).map((m) => m.to) : [];
  const checkSquare = inCheck(pos.board, pos.turn) ? findKing(pos.board, pos.turn) : null;
  const redMovesLeft = puzzle.depth - Math.floor(line.length / 2);
  const stars = tries === 1 && !hint ? 3 : tries <= 3 ? 2 : 1;

  // Bật live: mọi thao tác trên bàn (chọn quân, đi thử, sai, Đen đỡ, giải xong) phản chiếu lên sân khấu.
  const notations = useMemo(() => {
    let p = parseFen(puzzle.fen);
    const out: string[] = [];
    for (const m of line) {
      out.push(moveNotation(p.board, m));
      p = applyMove(p, m);
    }
    return out;
  }, [line, puzzle.fen]);
  useEffect(() => {
    if (!live) return;
    onLiveState({
      puzzleId: puzzle.id,
      board: pos.board,
      ids,
      selected,
      targets: selected !== null ? legalMovesFrom(pos, selected).map((m) => m.to) : [],
      lastMove,
      checkSquare: inCheck(pos.board, pos.turn) ? findKing(pos.board, pos.turn) : null,
      status,
      tries,
      moves: notations,
      hintSquare: hint ? puzzle.solution.from : null,
    });
  }, [live, onLiveState, puzzle, pos, ids, selected, lastMove, status, tries, notations, hint]);

  const play = (move: Move, from: typeof pos, idsBefore: (number | null)[]) => {
    const next = applyMove(from, move);
    const nextIds = idsBefore.slice();
    nextIds[move.to] = nextIds[move.from];
    nextIds[move.from] = null;
    const o = outcome(next);
    playSound(o.over ? "check" : from.board[move.to] ? "capture" : inCheck(next.board, next.turn) ? "check" : "move");
    setPos(next);
    setIds(nextIds);
    setLastMove(move);
    return { next, nextIds, over: o.over };
  };

  const finish = async (fullLine: Move[], attempts: number, earned: number) => {
    setStatus("solved");
    setTimeout(() => playSound("win"), 250);
    onSolved(earned);
    if (!member) {
      setReward("Đăng nhập để lưu tiến độ và nhận xu thưởng.");
      return;
    }
    const res = await submitPuzzleSolution(puzzle.id, fullLine, attempts).catch(() => null);
    if (res?.ok) {
      setReward(res.reward ? `+${res.reward} xu (lần giải đầu)` : "Đã lưu tiến độ.");
      if (res.reward) refresh();
    } else {
      setReward(res?.message ?? "Không lưu được tiến độ, vui lòng thử lại.");
    }
  };

  const onSquareClick = (i: number) => {
    if (status !== "play" || locked) return;
    const p = pos.board[i];
    if (p && sideOf(p) === pos.turn) {
      setSelected(selected === i ? null : i);
      return;
    }
    if (selected === null || !targets.includes(i)) {
      setSelected(null);
      return;
    }
    const move = { from: selected, to: i };
    const good = puzzle.line ? lineMoveOk(pos, puzzle.line, line.length, move) : moveWins(pos, move, redMovesLeft);
    const { next, nextIds, over } = play(move, pos, ids);
    const played = [...line, move];
    setLine(played);
    setSelected(null);

    if (!good) {
      setTries((t) => t + 1);
      setStatus("wrong");
      timer.current = setTimeout(reset, 1200);
      return;
    }
    if (over) {
      const attempts = tries + 1;
      setTries(attempts);
      void finish(played, attempts, attempts === 1 && !hint ? 3 : attempts <= 3 ? 2 : 1);
      return;
    }
    // Đúng nhưng chưa xong: máy cầm Đen đỡ bằng nước cứng nhất (thế dài: theo biến chính đã kiểm chứng).
    setStatus("reply");
    timer.current = setTimeout(() => {
      const reply = puzzle.line ? puzzle.line[played.length] : toughestReply(next, redMovesLeft - 1);
      if (!reply) return;
      play(reply, next, nextIds);
      setLine([...played, reply]);
      setStatus("play");
    }, 600);
  };

  const askHint = async () => {
    if (freeHint || hintOwned) {
      setHint(true);
      return;
    }
    if (!member) {
      setNotice("Đăng nhập để dùng gợi ý (10 xu mỗi thế).");
      return;
    }
    const res = await getHint(puzzle.id).catch(() => null);
    if (res?.ok) {
      setHint(true);
      onHintBought();
      if (res.charged) refresh();
    } else {
      setNotice(res?.message ?? "Không lấy được gợi ý.");
    }
  };

  const message = locked ? "Chương này dành cho thành viên VIP."
    : status === "solved" ? `Chính xác! Ví dụ lời giải: ${puzzle.solutionText}.`
      : status === "wrong" ? (puzzle.depth === 1 ? "Chưa chiếu bí. Thử lại nhé!"
        : puzzle.line ? `Nước này không chiếu bí kịp trong ${redMovesLeft} nước. Thử lại nhé!`
          : "Nước này để Đen thoát được. Thử lại nhé!")
        : status === "reply" ? "Đúng hướng! Đen đang đỡ…"
          : hint ? `Gợi ý: ${puzzle.hint}`
            : notice ?? (line.length ? "Đen đã đỡ. Tiếp tục ép sát!" : "Đến lượt Đỏ. Chọn quân để bắt đầu.");

  return (
    <>
      <section className={styles.center} aria-label="Bàn cờ thế">
        <XiangqiBoard
          board={pos.board}
          ids={ids}
          selected={selected}
          targets={targets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          hintSquare={hint && status === "play" && line.length === 0 ? puzzle.solution.from : null}
          disabled={status !== "play" || locked}
          onSquareClick={onSquareClick}
        >
          {locked && (
            <ResultOverlay seal="VIP" title="Chương dành cho VIP" detail="Mở khóa toàn bộ thế cờ nâng cao, nhận 300 xu mỗi ngày.">
              <Link href="/shop#vip" className="btn btn-primary">Xem gói VIP</Link>
            </ResultOverlay>
          )}
          {status === "solved" && (
            <ResultOverlay seal="絕殺" title="Chiếu bí! Giải đúng thế cờ." detail={`${stars} sao`}>
              {reward && <p className={styles.reward}>{reward}</p>}
              <button type="button" className="btn" onClick={reset}>Chơi lại</button>
              {onNext && <button type="button" className="btn btn-primary" onClick={onNext}>Thế tiếp theo</button>}
            </ResultOverlay>
          )}
        </XiangqiBoard>
      </section>

      <aside className={styles.info}>
        <div className={`card ${styles.panel}`}>
          <span className={styles.kicker}>{puzzle.chapter.toUpperCase()} · THẾ {index + 1} / {PUZZLES.length}</span>
          <h1 className={styles.title}>{puzzle.title}</h1>
          <p className="muted">{puzzle.goal}</p>
          {puzzle.source && <p className="muted">Xuất xứ: {puzzle.source}</p>}
          <div className={styles.message} data-status={status} role="status">{message}</div>
          <span className="muted">Số lần thử: <strong>{tries}</strong></span>
        </div>
        <div className={styles.actions}>
          <button type="button" className="btn" onClick={askHint} disabled={hint || status !== "play" || locked}>
            {freeHint || hintOwned ? "Gợi ý" : "Gợi ý (10 xu)"}
          </button>
          <button type="button" className="btn" onClick={reset} disabled={locked}>Đặt lại</button>
          {!locked && (
            <button type="button" className="btn" aria-pressed={live} onClick={onToggleLive} title="Hiện bảng điều khiển chiếu thế này lên sân khấu livestream (OBS)">
              {live ? "✕ Ẩn bảng live" : "🎥 Chiếu lên live"}
            </button>
          )}
        </div>
        {livePanel}
      </aside>
    </>
  );
}
