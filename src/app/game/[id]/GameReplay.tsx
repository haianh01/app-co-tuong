"use client";

import Link from "next/link";
import { useMemo, useState, type KeyboardEvent } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { MoveList, PlayerCard } from "@/components/game/GamePanels";
import { Side, findKing, inCheck, opponent } from "@/lib/xiangqi/engine";
import { describeResult, replayMoves, type EndReason } from "@/lib/xiangqi/game";
import play from "@/app/play/play.module.css";
import styles from "./game.module.css";

export interface ReplayPlayer {
  id: string;
  username: string;
  displayName: string;
  before: number;
  after: number;
}

export interface ReplayData {
  id: string;
  minutes: number;
  winner: Side | null;
  reason: EndReason;
  moves: { from: number; to: number }[];
  red: ReplayPlayer;
  black: ReplayPlayer;
  endedAt: string;
}

export function GameReplay({ data, viewerId }: { data: ReplayData; viewerId: string | null }) {
  const full = useMemo(() => replayMoves(data.moves), [data.moves]);
  const total = full.moves.length;
  const [ply, setPly] = useState(total);
  const go = (p: number) => setPly(Math.max(0, Math.min(total, p)));

  const mySide: Side | null = viewerId === data.red.id ? "r" : viewerId === data.black.id ? "b" : null;
  const bottom: Side = mySide ?? "r";
  const pos = full.history[ply];
  const lastMove = ply > 0 ? full.moves[ply - 1].move : null;
  const checkSquare = inCheck(pos.board, pos.turn) ? findKing(pos.board, pos.turn) : null;
  const result = describeResult({ winner: data.winner, reason: data.reason }, mySide);

  const card = (s: Side) => {
    const p = s === "r" ? data.red : data.black;
    const d = p.after - p.before;
    return (
      <PlayerCard
        className={s === bottom ? play.me : play.opp}
        name={s === mySide ? `${p.displayName} (Bạn)` : p.displayName}
        subtitle={`Elo ${p.before} → ${p.after} (${d >= 0 ? "+" : "−"}${Math.abs(d)}) · ${s === "r" ? "Đỏ" : "Đen"}`}
        avatar={p.displayName.slice(0, 1).toUpperCase()}
        highlight={s === mySide}
        clock={null}
        clockActive={false}
        clockLow={false}
        captured={full.moves.slice(0, ply).filter((m) => m.side === s && m.captured).map((m) => m.captured!)}
      />
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowLeft: ply - 1, ArrowRight: ply + 1, Home: 0, End: total };
    if (e.key in keys) {
      e.preventDefault();
      go(keys[e.key]);
    }
  };

  return (
    <main className={play.layout} onKeyDown={onKeyDown}>
      <div className={play.side}>
        {card(opponent(bottom))}
        <div className={`card ${play.status}`} role="status">
          <strong>{result.title}</strong>
          <span className="muted">{result.detail}</span>
          <span className="muted">
            {data.minutes} phút ·{" "}
            {new Date(data.endedAt).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" })}
          </span>
        </div>
        {card(bottom)}
      </div>

      <section className={play.center} aria-label="Bàn cờ">
        <XiangqiBoard board={pos.board} orientation={bottom} lastMove={lastMove} checkSquare={checkSquare} disabled />
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
          <div className={styles.players}>
            <span>Hồ sơ: <Link href={`/u/${data.red.username}`}>{data.red.displayName}</Link> · <Link href={`/u/${data.black.username}`}>{data.black.displayName}</Link></span>
          </div>
          <Link href="/online" className="btn btn-primary">Đấu ván mới</Link>
        </div>
      </div>
    </main>
  );
}
