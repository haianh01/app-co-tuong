// Khôi phục ván đang dở khi trang tường thuật Ziga được mở lại (reload, tab bị treo...): relay vẫn giữ các gói gần
// nhất trong bộ nhớ server, nên chỉ cần phát lại các gói của ván hiện tại qua đúng bộ xử lý gói như lúc nhận trực tiếp.
//
// Mốc ("anchor") là gói ván bắt đầu (0x1a) hoặc vào bàn giữa ván (0x33 có thế cờ) gần nhất: từ đó trở đi phát lại đủ.
// Trước mốc chỉ lấy phần cho biết ai là ai (đăng nhập, danh sách người chơi, elo, thể thức giờ, sẵn sàng), không lấy
// nước đi hay kết thúc ván, để không bày lại hay ghi thêm kết quả của các ván cũ.

import type { ZigaParsedMessage } from "./ziga-parser";

interface PacketLike {
  direction: "in" | "out" | "ui";
  parsed: ZigaParsedMessage;
}

/** Các trường của gói trước mốc được giữ lại khi phát lại. */
const CONTEXT_KEYS = ["login", "roster", "playerLeave", "eloUpdate", "timeControl", "playerStatus"] as const;

const isAnchor = (p: PacketLike) => !!(p.parsed.gameStart || p.parsed.tableSnapshot);

export interface ZigaReplay<P> {
  /** Gói cần phát lại theo đúng thứ tự (gói trước mốc đã được lược bớt). */
  packets: P[];
  /** Có tìm thấy mốc ván hiện tại không. Không có mà vẫn có nước đi thì không bày lại được thế cờ. */
  anchored: boolean;
  /** Số gói nước đi (đã được server xác nhận) sau mốc. */
  moves: number;
  /** Lịch sử có nước đi nhưng không có mốc (ván bắt đầu trước khi relay giữ được gói). */
  orphanMoves: boolean;
}

export function zigaReplay<P extends PacketLike>(history: readonly P[]): ZigaReplay<P> {
  let anchor = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (isAnchor(history[i])) {
      anchor = i;
      break;
    }
  }

  const packets: P[] = [];
  for (const p of anchor < 0 ? history : history.slice(0, anchor)) {
    const ctx: Partial<ZigaParsedMessage> = {};
    for (const k of CONTEXT_KEYS) if (p.parsed[k] !== undefined) Object.assign(ctx, { [k]: p.parsed[k] });
    // Gói mình bấm "Sẵn sàng": cần để biết ghế của mình
    const readySent = p.direction === "out" && p.parsed.eventType === "ready_sent";
    if (Object.keys(ctx).length === 0 && !readySent) continue;
    packets.push({
      ...p,
      parsed: { raw: p.parsed.raw, summary: p.parsed.summary, eventType: readySent ? "ready_sent" : "context", ...ctx },
    });
  }

  const tail = anchor < 0 ? [] : history.slice(anchor);
  packets.push(...tail);
  const isMove = (p: P) => !!p.parsed.move;
  return {
    packets,
    anchored: anchor >= 0,
    moves: tail.filter(isMove).length,
    orphanMoves: anchor < 0 && history.some(isMove),
  };
}
