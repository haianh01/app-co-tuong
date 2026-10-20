// Ghi thành tích hôm nay khi hết ván, theo góc nhìn người dẫn (người đang chơi).

import { outcome, type Position, type Side } from "@/lib/xiangqi/engine";
import type { StageRecord, StageSettings } from "./stage-sync";

export type StageResult = "win" | "draw" | "loss";

const KEY: Record<StageResult, keyof StageRecord> = { win: "win", draw: "draw", loss: "loss" };

/** Đổi kết quả của ván hiện tại (bấm nhầm thì bấm lại): bỏ kết quả cũ, cộng kết quả mới. */
export function changeResult(today: StageRecord, from: StageResult | null, to: StageResult | null): StageRecord {
  const out = { ...today };
  if (from) out[KEY[from]] = Math.max(0, out[KEY[from]] - 1);
  if (to) out[KEY[to]]++;
  return out;
}

/** Kết quả đọc được từ bàn cờ (chỉ chiếu bí/hết nước; xin thua, hết giờ thì bàn cờ không cho biết). */
export function resultOnBoard(pos: Position, mySide: Side): StageResult | null {
  const o = outcome(pos);
  if (!o.over) return null;
  if (!o.winner) return "draw";
  return o.winner === mySide ? "win" : "loss";
}

/**
 * Sang ván sau: nếu người dẫn chưa bấm kết quả mà bàn cờ đã phân thắng thua thì tự ghi; tăng số ván; xóa thông tin
 * đối thủ cũ (để không hiện nhầm tên người khác ở ván mới).
 */
export function nextRound(settings: StageSettings, chosen: StageResult | null, onBoard: StageResult | null): StageSettings {
  return {
    ...settings,
    today: chosen ? settings.today : changeResult(settings.today, null, onBoard),
    round: settings.round + 1,
    opponent: { name: "Đối thủ" },
  };
}
