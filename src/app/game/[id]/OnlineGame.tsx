"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { MoveList, PlayerCard, ResultOverlay } from "@/components/game/GamePanels";
import { formatClock } from "@/hooks/useClock";
import { useMoveSounds, useResultSound } from "@/hooks/useGameSounds";
import { useSocket } from "@/hooks/useSocket";
import { USER_REFRESH_EVENT } from "@/lib/events";
import { QUICK_CHAT, tcLabel, type GameSnapshot, type PlayerInfo } from "@/lib/online/protocol";
import { Move, Side, findKing, inCheck, legalMovesFrom, opponent, sideOf } from "@/lib/xiangqi/engine";
import { currentPosition, describeResult, pieceIds, replayMoves } from "@/lib/xiangqi/game";
import play from "@/app/play/play.module.css";
import styles from "./game.module.css";

const sideName = (s: Side) => (s === "r" ? "Đỏ" : "Đen");

export function OnlineGame({ gameId, me }: { gameId: string; me: PlayerInfo | null }) {
  const router = useRouter();
  const [snap, setSnap] = useState<{ game: GameSnapshot; at: number } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Move | null>(null);
  const [selection, setSelection] = useState<{ ply: number; square: number } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [chatCooldown, setChatCooldown] = useState(false);
  const [now, setNow] = useState(0);

  const { send, status } = useSocket({
    onOpen: (send) => send({ t: "watch", gameId }),
    onMessage: (msg, receivedAt) => {
      if (msg.t === "game" && msg.game.id === gameId) {
        setSnap({ game: msg.game, at: receivedAt });
        setPending(null);
        setNotFound(false);
      } else if (msg.t === "notFound" && msg.gameId === gameId) {
        setNotFound(true);
      } else if (msg.t === "matched" && msg.gameId !== gameId) {
        // Hai bên đồng ý đấu lại, hoặc giải Arena ghép ván tiếp: chuyển sang ván mới.
        router.push(`/game/${msg.gameId}`);
      } else if (msg.t === "error") {
        setNotice(msg.message);
      }
    },
  });

  const game = snap?.game ?? null;
  const playing = game?.status === "playing";

  // Đồng hồ hiển thị chạy cục bộ giữa hai lần server gửi trạng thái.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  // Elo vừa được cập nhật: báo header tải lại điểm mới.
  const rated = game?.ratingChange != null;
  useEffect(() => {
    if (rated) window.dispatchEvent(new Event(USER_REFRESH_EVENT));
  }, [rated]);

  useEffect(() => {
    if (!confirmResign) return;
    const id = setTimeout(() => setConfirmResign(false), 3000);
    return () => clearTimeout(id);
  }, [confirmResign]);

  useEffect(() => {
    if (!chatCooldown) return;
    const id = setTimeout(() => setChatCooldown(false), 1600);
    return () => clearTimeout(id);
  }, [chatCooldown]);

  // Nước vừa đi được hiện ngay (chờ server xác nhận); server gửi trạng thái mới thì thay thế.
  const state = useMemo(
    () => replayMoves(game ? [...game.moves, ...(pending ? [pending] : [])] : []),
    [game, pending],
  );

  const mySide: Side | null = me && game ? (game.players.r.id === me.id ? "r" : game.players.b.id === me.id ? "b" : null) : null;
  useMoveSounds(state.moves);
  useResultSound(game?.status === "ended" ? game.result : null, mySide);

  if (!game || !snap) {
    return (
      <main className={styles.message}>
        {notFound ? (
          <div className={`card ${styles.messageCard}`}>
            <h1>Không tìm thấy ván đấu</h1>
            <p className="muted">Ván có thể đã bị hủy, hoặc máy chủ vừa khởi động lại.</p>
            <Link href="/online" className="btn btn-primary">Về sảnh đấu</Link>
          </div>
        ) : (
          <p className="muted">{status === "open" ? "Đang tải ván đấu…" : "Đang kết nối máy chủ…"}</p>
        )}
      </main>
    );
  }

  const bottom: Side = mySide ?? "r";
  const pos = currentPosition(state);
  const ply = state.moves.length;
  const elapsed = now > snap.at ? now - snap.at : 0;
  const clockSide = playing && game.moves.length >= 2 ? game.turn : null;
  const clockOf = (s: Side) => Math.max(0, game.clocks[s] - (s === clockSide ? elapsed : 0));
  const firstMoveLeft = game.firstMoveDeadline
    ? Math.max(0, Math.ceil((game.firstMoveDeadline - game.serverNow - elapsed) / 1000))
    : null;

  const connected = status === "open";
  const canMove = connected && playing && mySide === pos.turn && !pending;
  const selected = selection?.ply === ply ? selection.square : null;
  const targets = canMove && selected !== null ? legalMovesFrom(pos, selected).map((m) => m.to) : [];
  const checkSquare = inCheck(pos.board, pos.turn) ? findKing(pos.board, pos.turn) : null;
  const lastMove = state.moves[ply - 1]?.move ?? null;
  const opp = mySide ? opponent(mySide) : null;
  const tc = tcLabel(game.minutes, game.increment);

  const onSquareClick = (i: number) => {
    if (!canMove || !mySide) return;
    const p = pos.board[i];
    if (p && sideOf(p) === mySide) {
      setSelection(selected === i ? null : { ply, square: i });
      return;
    }
    if (selected !== null && targets.includes(i)) {
      const move = { from: selected, to: i };
      setPending(move);
      send({ t: "move", gameId, from: move.from, to: move.to, ply: game.moves.length });
    }
    setSelection(null);
  };

  const captured = (s: Side) => state.moves.filter((m) => m.side === s && m.captured).map((m) => m.captured!);

  const card = (s: Side) => {
    const p = game.players[s];
    const delta = game.ratingChange?.[s];
    const ratingText = p.isGuest
      ? "Khách"
      : delta === undefined
        ? `Elo ${p.rating}`
        : `Elo ${p.rating + delta} (${delta >= 0 ? "+" : "−"}${Math.abs(delta)})`;
    const away = playing && game.moves.length >= 2 && !game.connected[s] ? " · mất kết nối" : "";
    return (
      <PlayerCard
        className={s === bottom ? play.me : play.opp}
        name={s === mySide ? `${p.displayName} (Bạn)` : p.displayName}
        subtitle={`${ratingText} · ${sideName(s)}${away}`}
        avatar={p.displayName.slice(0, 1).toUpperCase()}
        avatarId={p.avatar}
        frameId={p.frame}
        highlight={s === mySide}
        clock={formatClock(clockOf(s))}
        clockActive={clockSide === s}
        clockLow={clockOf(s) < 30_000}
        captured={captured(s)}
      />
    );
  };

  let statusText: string;
  if (game.status === "aborted") statusText = "Ván đã bị hủy";
  else if (game.status === "ended" && game.result) statusText = describeResult(game.result, mySide).title;
  else if (firstMoveLeft !== null) {
    statusText = mySide === game.turn
      ? `Hãy đi nước đầu (còn ${firstMoveLeft} giây)`
      : `Chờ ${sideName(game.turn)} đi nước đầu (còn ${firstMoveLeft} giây)`;
  } else if (mySide) statusText = mySide === pos.turn ? "Đến lượt bạn" : "Đối thủ đang suy nghĩ…";
  else statusText = `Lượt ${sideName(pos.turn)}`;

  const rematchButtons = (() => {
    if (!mySide || game.tournamentId) return null;
    const r = game.rematch;
    if (r.gameId) return <Link href={`/game/${r.gameId}`} className="btn btn-primary">Vào ván đấu lại</Link>;
    if (r.offeredBy === mySide) return <button type="button" className="btn" disabled>Đã mời đấu lại…</button>;
    if (r.offeredBy === opp) {
      return (
        <>
          <button type="button" className="btn btn-primary" onClick={() => send({ t: "rematch", gameId, action: "accept" })}>
            Đồng ý đấu lại
          </button>
          <button type="button" className="btn" onClick={() => send({ t: "rematch", gameId, action: "decline" })}>
            Từ chối
          </button>
        </>
      );
    }
    return <button type="button" className="btn btn-primary" onClick={() => send({ t: "rematch", gameId, action: "offer" })}>Đấu lại</button>;
  })();

  const overlay = (() => {
    if (game.status === "playing") return null;
    const actions = (
      <>
        {rematchButtons}
        {mySide && !game.tournamentId && (
          <Link href={`/online?tc=${encodeURIComponent(tc)}&rated=${game.rated ? 1 : 0}`} className="btn">Ván mới · {tc}</Link>
        )}
        {game.tournamentId && <Link href={`/tournaments/${game.tournamentId}`} className="btn btn-primary">Về giải đấu</Link>}
        {game.tournamentId && mySide && (
          <button type="button" className="btn" onClick={() => send({ t: "arenaLeave", id: game.tournamentId! })}>
            Tạm nghỉ (không ghép ván tiếp)
          </button>
        )}
        <Link href="/online" className="btn">Về sảnh</Link>
      </>
    );
    if (game.status === "aborted" || !game.result) {
      return <ResultOverlay seal="廢" title="Ván bị hủy" detail="Không tính điểm">{actions}</ResultOverlay>;
    }
    const text = describeResult(game.result, mySide);
    const delta = mySide ? game.ratingChange?.[mySide] : undefined;
    const ratingLine = !mySide
      ? ""
      : !game.rated
        ? " · Ván giao hữu"
        : delta === undefined
          ? " · Đang cập nhật Elo…"
          : ` · Elo ${delta >= 0 ? "+" : "−"}${Math.abs(delta)}`;
    return (
      <ResultOverlay seal={text.seal} title={text.title} detail={text.detail + ratingLine}>
        {actions}
      </ResultOverlay>
    );
  })();

  return (
    <main className={play.layout}>
      <div className={play.side}>
        {card(opponent(bottom))}
        <div className={`card ${play.status}`} role="status">
          <strong>{statusText}</strong>
          {checkSquare !== null && playing && <span className={play.checkSeal}>將軍</span>}
          {!connected && <span className={styles.warn}>Mất kết nối, đang kết nối lại…</span>}
          {opp && playing && game.moves.length >= 2 && !game.connected[opp] && (
            <span className={styles.warn}>Đối thủ đã rời ván. Nếu không quay lại trong 60 giây sẽ bị xử thua.</span>
          )}
          {!mySide && <span className="muted">Bạn đang xem ván này.</span>}
        </div>
        {card(bottom)}
      </div>

      <section className={play.center} aria-label="Bàn cờ">
        <XiangqiBoard
          board={pos.board}
          ids={pieceIds(state)}
          orientation={bottom}
          selected={selected}
          targets={targets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          disabled={!canMove}
          onSquareClick={onSquareClick}
        >
          {overlay}
        </XiangqiBoard>
      </section>

      <div className={play.side}>
        <div className={`card ${play.panel} ${play.controls}`}>
          <div className={play.panelHead}>
            <h2 className={play.panelTitle}>Biên bản</h2>
            <span className="muted">
              {tc} · {game.rated ? "Tính điểm" : "Giao hữu"} · {ply} nửa nước
            </span>
          </div>
          <MoveList moves={state.moves} />
          {mySide && playing && (
            <div className={play.actions}>
              {game.drawOffer && game.drawOffer !== mySide ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => send({ t: "draw", gameId, action: "accept" })}>
                    Đồng ý hòa
                  </button>
                  <button type="button" className="btn" onClick={() => send({ t: "draw", gameId, action: "decline" })}>
                    Từ chối hòa
                  </button>
                </>
              ) : game.moves.length < 2 ? (
                <button type="button" className="btn" onClick={() => send({ t: "abort", gameId })}>
                  Hủy ván
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={game.drawOffer === mySide || !connected}
                  onClick={() => send({ t: "draw", gameId, action: "offer" })}
                >
                  {game.drawOffer === mySide ? "Đã gửi cầu hòa" : "Cầu hòa"}
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger"
                disabled={!connected}
                onClick={() => {
                  if (!confirmResign) {
                    setConfirmResign(true);
                    return;
                  }
                  setConfirmResign(false);
                  send({ t: "resign", gameId });
                }}
              >
                {confirmResign ? "Bấm lần nữa để xin thua" : "Xin thua"}
              </button>
            </div>
          )}
          {game.drawOffer && mySide && game.drawOffer !== mySide && playing && (
            <p className={styles.offer} role="alert">Đối thủ đề nghị hòa.</p>
          )}
          {notice && <p className={styles.warn} role="alert">{notice}</p>}
        </div>

        <div className={`card ${play.panel} ${play.setup}`}>
          <h2 className={play.panelTitle}>Trò chuyện</h2>
          <ul className={styles.chat} aria-live="polite" aria-label="Tin nhắn trong ván">
            {game.chat.length === 0 && <li className="muted">Chưa có tin nhắn.</li>}
            {game.chat.slice(-12).map((c, i) => (
              <li key={`${c.at}-${i}`}>
                <strong className={c.side === "r" ? styles.chatRed : undefined}>{game.players[c.side].displayName}:</strong>{" "}
                {QUICK_CHAT[c.phrase]}
              </li>
            ))}
          </ul>
          {mySide && (
            <div className={styles.phrases}>
              {QUICK_CHAT.map((text, i) => (
                <button
                  key={text}
                  type="button"
                  className={styles.phrase}
                  disabled={chatCooldown || !connected}
                  onClick={() => {
                    setChatCooldown(true);
                    send({ t: "chat", gameId, phrase: i });
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
