// Cài đặt trợ lý live đổi trên trang /tuong-thuat/tro-ly, lưu ra file để khởi động lại server không mất.
// .env chỉ còn giữ khóa API và thông tin kết nối; các biến BOT_* cũ trong .env (nếu có) chỉ làm giá trị ban đầu.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BotLiveSettings } from "./types";

/** Đường dẫn file lưu; BOT_SETTINGS_FILE="" thì không đọc/ghi file (dùng trong test). */
const SETTINGS_FILE = process.env.BOT_SETTINGS_FILE ?? path.resolve(process.cwd(), ".data/bot-settings.json");

export const DEFAULT_BOT_NAME = "Tiểu Tốt";
export const DEFAULT_BOT_PERSONA =
  'Tiểu Tốt là cô phù thủy tí hon ngồi trên vai anh chủ kênh. Vốn là một quân Tốt trên bàn cờ, được phép thuật biến thành người, nên rất tự hào về quân Tốt ("Tốt qua sông bằng nửa Xe đấy nhé") và mơ có ngày được qua sông phong làm Xe. Lanh lợi, tò mò, nói nhanh, mê cờ hơn mê kẹo; trung thành với anh chủ kênh nhưng thỉnh thoảng chọc nhẹ. Cây cọ phép là để "vẽ" thế cờ. Câu khó thì nói thật là phải về lật sách phép đã.';

/** Giới hạn độ dài để lời dặn nhân vật không chiếm hết prompt. */
export const LIMITS = { name: 40, self: 20, persona: 1200, hostProfile: 2000, minutes: [1, 30] as const };

export function loadSavedSettings(): Partial<BotLiveSettings> {
  if (!SETTINGS_FILE) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) as Partial<BotLiveSettings>;
  } catch {
    return {};
  }
}

/** Không lưu inGame: đó là trạng thái ván đang đánh, không phải cài đặt. */
export function saveSettings(settings: BotLiveSettings): void {
  if (!SETTINGS_FILE) return;
  const { inGame: _inGame, ...keep } = settings;
  try {
    mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    writeFileSync(SETTINGS_FILE, JSON.stringify(keep, null, 2));
  } catch (err) {
    console.warn(`[Bot] Không lưu được cài đặt vào ${SETTINGS_FILE}: ${String(err)}`);
  }
}
