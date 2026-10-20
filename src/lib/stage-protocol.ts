// Kênh nối trang điều khiển tường thuật với trang sân khấu livestream. Đi qua server (không dùng BroadcastChannel)
// vì trang sân khấu thường chạy trong Browser Source của OBS: một trình duyệt riêng, không chung bộ nhớ với tab
// điều khiển.
//
//   /ws/stage?room=<khóa>&role=control   trang điều khiển: gửi trạng thái, nhận số sân khấu đang mở
//   /ws/stage?room=<khóa>&role=view      trang sân khấu: nhận trạng thái mới nhất ngay khi kết nối, rồi mọi cập nhật
//
// Khóa phòng do trang điều khiển tự sinh ngẫu nhiên; ai có khóa thì điều khiển được sân khấu của phòng đó.

export const STAGE_WS_PATH = "/ws/stage";
export const STAGE_ROOM_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** Trạng thái sân khấu là JSON nhỏ (bàn cờ, biên bản, tên); chặn trên để một kết nối không làm đầy bộ nhớ server. */
export const STAGE_MAX_PAYLOAD = 256 * 1024;

export type StageRole = "control" | "view";

export type StageVoiceEvent = "check" | "win" | "loss";

/** Điều khiển → server → sân khấu. `state` là StageState (src/app/tuong-thuat/stage-sync.ts); server không đọc nó. */
export type StageRelayMessage =
  | { t: "state"; state: unknown }
  | { t: "recap" }
  | { t: "voice"; event: StageVoiceEvent; text?: string };

/** Server → điều khiển. */
export type StageServerMessage = { t: "viewers"; n: number };

export function stageSocketUrl(loc: { protocol: string; host: string }, room: string, role: StageRole): string {
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${loc.host}${STAGE_WS_PATH}?room=${encodeURIComponent(room)}&role=${role}`;
}

/** Khóa phòng ngẫu nhiên 22 ký tự (~131 bit). */
export function newStageRoom(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
