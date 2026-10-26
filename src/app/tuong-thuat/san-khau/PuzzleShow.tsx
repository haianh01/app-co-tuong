"use client";

// Sân khấu "Thử thách cờ thế" (1080×1920 dọc), thay hẳn giao diện ván Ziga khi người dẫn chiếu cờ thế từ trang Cờ thế.
// Từ trên xuống: tên chương trình + khung camera · thẻ đề bài · dải mục tiêu · bàn cờ · dòng trạng thái · thành tích ·
// dải chữ chạy. Bàn cờ phản chiếu người dẫn đang giải (chọn quân, đi thử, sai, Đen đỡ, giải xong); khi lật đáp án thì
// bàn cờ theo đáp án.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { playSound } from "@/lib/sound";
import { findKing, inCheck, type Side } from "@/lib/xiangqi/engine";
import { PUZZLES } from "@/lib/xiangqi/puzzles";
import type { StageState } from "../stage-sync";
import { buildPuzzleStage, countdownSecondsLeft, type StagePuzzleState } from "../stage-puzzle";
import styles from "./puzzle-show.module.css";

const subscribeNever = () => () => {};

/** Tên miền của trang sân khấu: chính app phục vụ trang này, nên đây là địa chỉ khán giả vào được (rỗng khi render trên server). */
function usePageHost(): string {
  return useSyncExternalStore(subscribeNever, () => window.location.host, () => "");
}

/** Giờ hiện tại, cập nhật mỗi 250ms khi đang đếm ngược. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Độ khó hiện bằng sao: mỗi nước Đỏ một sao, tối đa 5. */
function Stars({ n }: { n: number }) {
  const on = Math.min(5, Math.max(1, n));
  return (
    <span className={styles.stars} aria-label={`Độ khó ${on}/5`}>
      {"★".repeat(on)}
      <span className={styles.starsOff}>{"★".repeat(5 - on)}</span>
    </span>
  );
}

function Countdown({ countdown, now }: { countdown: { startedAt: number; durationMs: number }; now: number }) {
  const left = countdownSecondsLeft(countdown, now);
  const frac = countdown.durationMs > 0 ? Math.min(1, Math.max(0, (countdown.durationMs - Math.max(0, now - countdown.startedAt)) / countdown.durationMs)) : 0;
  const R = 88;
  const C = 2 * Math.PI * R;
  return (
    <div className={styles.countdown} data-urgent={left > 0 && left <= 10 ? true : undefined} data-over={left === 0 ? true : undefined}>
      <svg viewBox="0 0 200 200" className={styles.countdownRing} aria-hidden="true">
        <circle cx="100" cy="100" r={R} className={styles.countdownTrack} />
        <circle cx="100" cy="100" r={R} className={styles.countdownArc} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      </svg>
      <span className={styles.countdownValue}>{left > 0 ? left : "HẾT GIỜ"}</span>
      <span className={styles.countdownLabel}>{left > 0 ? "GIÂY ĐỂ ĐOÁN" : "Cùng xem đáp án!"}</span>
    </div>
  );
}

/** Dòng trạng thái dưới bàn cờ: kể cho người xem người dẫn đang làm gì. */
function statusLine(puzzle: StagePuzzleState, host: string): { tone: string; tag: string; text: string } {
  const live = puzzle.live ?? null;
  if (puzzle.phase === "solved") {
    return { tone: "win", tag: "絕殺", text: `Chiếu bí! Đáp án: ${numbered(puzzle.revealed)}` };
  }
  if (puzzle.phase === "reveal") {
    return { tone: "answer", tag: "ĐÁP ÁN", text: numbered(puzzle.revealed) + (puzzle.caption ? ` — ${puzzle.caption}` : "") };
  }
  if (live?.status === "solved") {
    const n = Math.max(1, live.tries);
    return { tone: "win", tag: "CHÍNH XÁC", text: `${host} đã giải được${n > 1 ? ` sau ${n} lần thử` : " ngay lần đầu"}! ${numbered(live.moves)}` };
  }
  if (live?.status === "wrong") {
    const tried = live.moves.at(-1) ?? "Nước này";
    return { tone: "wrong", tag: "CHƯA ĐÚNG", text: puzzle.depth === 1 ? `${tried} chưa chiếu bí. Thử lại nào!` : `${tried} để Đen thoát được. Thử lại nào!` };
  }
  if (live?.status === "reply") {
    return { tone: "busy", tag: "ĐEN ĐỠ", text: `Đúng hướng! Đen đang tìm đường thoát…` };
  }
  if (live && live.moves.length > 0) {
    return { tone: "busy", tag: `LẦN ${live.tries + 1}`, text: `${host} đang giải: ${numbered(live.moves)}` };
  }
  if (puzzle.phase === "hint" && puzzle.hintText) {
    return { tone: "hint", tag: "GỢI Ý", text: puzzle.hintText };
  }
  if (live?.selected != null) {
    return { tone: "busy", tag: "SUY NGHĨ", text: `${host} đang cân nhắc nước đi…` };
  }
  if (puzzle.phase === "thinking") {
    return { tone: "ask", tag: "BẠN ĐOÁN", text: "Comment nước đi đầu tiên của Đỏ, ví dụ: X1-6" };
  }
  return { tone: "ask", tag: "THẾ MỚI", text: "Bạn tìm ra nước đầu tiên chưa? Comment ngay!" };
}

/** "1. X1-6 S5/4 2. X8-5…" — đánh số theo nước Đỏ. */
function numbered(moves: string[]): string {
  return moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join("  ");
}

function Ticker({ lines }: { lines: string[] }) {
  const text = lines.filter(Boolean).join("   ✦   ");
  return (
    <div className={styles.ticker} aria-label="Dải chữ chạy">
      <div className={styles.tickerTrack}>
        <span>{text}</span>
        <span aria-hidden="true">{text}</span>
      </div>
    </div>
  );
}

export function PuzzleShow({ state, puzzle, transparent }: { state: StageState; puzzle: StagePuzzleState; transparent?: boolean }) {
  const { settings } = state;
  const host = settings.host || settings.me.name || "Kỳ Đài";
  const domain = usePageHost();
  const live = puzzle.live ?? null;
  const answer = puzzle.phase === "reveal" || puzzle.phase === "solved";
  const thinking = puzzle.phase === "thinking" && !!puzzle.countdown;
  const now = useNow(thinking);

  // Lật đáp án thì bàn cờ theo đáp án; còn lại phản chiếu bàn người dẫn đang giải.
  const board = answer || !live ? puzzle.board : live.board;
  const toMove: Side = answer ? (puzzle.revealPly % 2 === 0 ? "r" : "b") : "r";
  const checkSquare = answer
    ? inCheck(board, toMove) ? findKing(board, toMove) : null
    : live?.checkSquare ?? null;
  const win = puzzle.phase === "solved" || live?.status === "solved";
  const status = statusLine(puzzle, host);

  // Âm thanh theo thao tác của người dẫn: đi quân, sai, giải xong.
  const lastMoveKey = answer ? `a${puzzle.revealPly}` : live?.lastMove ? `l${live.lastMove.from}-${live.lastMove.to}-${live.moves.length}` : "";
  const prevMoveKey = useRef(lastMoveKey);
  useEffect(() => {
    if (lastMoveKey && lastMoveKey !== prevMoveKey.current) playSound(checkSquare !== null ? "check" : "move");
    prevMoveKey.current = lastMoveKey;
  }, [lastMoveKey, checkSquare]);
  const outcomeKey = win ? `win-${puzzle.puzzleId}` : live?.status === "wrong" ? `wrong-${live.tries}` : "";
  const prevOutcome = useRef(outcomeKey);
  useEffect(() => {
    if (outcomeKey && outcomeKey !== prevOutcome.current) playSound(win ? "win" : "lose");
    prevOutcome.current = outcomeKey;
  }, [outcomeKey, win]);

  const session = puzzle.session ?? null;
  const ticker = [
    "💻 Anh IT đang build app Cờ Tướng riêng để anh em có chỗ luyện tập & giải cờ thế cực mượt",
    "💡 Anh em có ý tưởng gì cho app thì cứ comment để mình sửa & hoàn thiện thêm nhé!",
    "🎯 Bác nào mê cờ vào thẩm thế này giúp em với! Comment ngay nước đầu của Đỏ nhé",
    `🧩 THỬ THÁCH CỜ THẾ cùng Anh IT`,
    "💬 Comment nước đi đầu tiên theo ký hiệu, ví dụ X1-6 hay M8.7",
    "❤ Thấy cờ hay thì thả tim & nhấn Follow ủng hộ Anh IT làm app nhé!",
    settings.cta,
    puzzle.source ? `📜 Thế cờ trích từ ${puzzle.source}` : "",
    `📚 Luyện thêm ${puzzle.total ?? PUZZLES.length} thế cờ tại ${domain ? `${domain}/puzzle` : "mục Cờ thế"}`,
  ];

  return (
    <div className={styles.show} data-transparent={transparent || undefined} data-thinking={thinking || undefined}>
      <header className={styles.header}>
        <div className={styles.seal} aria-hidden="true">殘局</div>
        <div className={styles.brand}>
          <h1 className={styles.showName}>THỬ THÁCH CỜ THẾ</h1>
          <div className={styles.hostRow}>
            <span className={styles.liveDot} />
            <span className={styles.liveTag}>LIVE</span>
            <span className={styles.host}>cùng {host}</span>
          </div>
        </div>
        <div className={styles.camera} aria-label="Khung camera">
          <span className={styles.cameraHint}>CAMERA</span>
        </div>
      </header>

      {/* Dải chữ chạy nổi bật phía trên, nằm ngay dưới Header giúp người xem thấy ngay, không bị che bởi khung bình luận livestream */}
      <Ticker lines={ticker} />

      <section className={styles.card} aria-label="Đề bài">
        <div className={styles.kicker}>
          <span>THẾ #{puzzle.number ?? "?"}{puzzle.total ? ` / ${puzzle.total}` : ""}</span>
          <span className={styles.dotSep}>·</span>
          <span>{puzzle.chapter}</span>
          <Stars n={puzzle.depth} />
        </div>
        <h2 className={styles.title}>{puzzle.title}</h2>
        {puzzle.source && <p className={styles.source}>Trích: {puzzle.source}</p>}
      </section>

      <div className={styles.goal} role="heading" aria-level={3}>{puzzle.goal}</div>

      <div className={styles.boardWrap} data-win={win || undefined} data-wrong={live?.status === "wrong" || undefined}>
        <XiangqiBoard
          board={board}
          ids={answer ? undefined : live?.ids}
          orientation="r"
          lastMove={answer ? puzzle.lastMove : live?.lastMove ?? null}
          checkSquare={checkSquare}
          hintSquare={answer ? null : live?.hintSquare ?? null}
          selected={answer ? null : live?.selected ?? null}
          targets={answer ? [] : live?.targets ?? []}
          arrows={answer ? puzzle.arrows : (live?.arrows ?? [])}
          highlights={answer ? puzzle.highlights : (live?.highlights ?? puzzle.highlights)}
          arrowWidthScale={1.8}
          animateArrows
          className={styles.board}
          variant="ziga"
          riverWatermark="Cờ Thế"
          disabled
        />
        {thinking && puzzle.countdown && <Countdown countdown={puzzle.countdown} now={now} />}
        {live?.status === "wrong" && <div className={styles.stampWrong} aria-hidden="true">SAI!</div>}
        {win && (
          <div key={`${puzzle.puzzleId}-${puzzle.phase}-${live?.status}`} className={styles.stampWin} role="img" aria-label="Chiếu bí">
            <span className={styles.stampWinCn}>絕殺</span>
            <span className={styles.stampWinVi}>CHIẾU BÍ!</span>
          </div>
        )}
        {puzzle.phase === "solved" && (
          <div className={styles.cta}>
            <strong>Giải thử tại {domain ? `${domain}/puzzle` : "mục Cờ thế"}</strong>
            <span>{settings.cta || "Follow để xem thế tiếp theo"}</span>
          </div>
        )}
      </div>

      <div className={styles.status} role="status" data-tone={status.tone}>
        <span className={styles.statusTag}>{status.tag}</span>
        <span className={styles.statusText}>{status.text}</span>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{session?.shown ?? 1}</span>
          <span className={styles.statLabel}>thế đã chiếu</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{session?.solved ?? 0}</span>
          <span className={styles.statLabel}>Anh IT tự giải</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{live ? live.tries + (live.status === "solved" ? 0 : 1) : 0}</span>
          <span className={styles.statLabel}>lần thử thế này</span>
        </div>
      </div>
    </div>
  );
}

/** Trạng thái mẫu cho `?preview=puzzle`: thế liên sát, người dẫn đang thử nước đầu. */
export function getPreviewPuzzleState(base: StageState): StageState {
  const sample = PUZZLES.find((p) => (p.line?.length ?? 0) >= 5) ?? PUZZLES[0];
  const stage = buildPuzzleStage(sample, "thinking", 0, { countdown: { startedAt: Date.now(), durationMs: 60_000 } });
  return {
    ...base,
    settings: { ...base.settings, host: base.settings.host || "Cờ Tướng Hải Anh" },
    puzzle: {
      ...stage,
      number: PUZZLES.indexOf(sample) + 1,
      total: PUZZLES.length,
      session: { shown: 4, solved: 3 },
      live: {
        puzzleId: sample.id,
        board: stage.board,
        selected: sample.solution.from,
        targets: [sample.solution.to],
        lastMove: null,
        checkSquare: null,
        status: "play",
        tries: 1,
        moves: [],
        hintSquare: null,
      },
    },
  };
}
