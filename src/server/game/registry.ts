// Server game và code Next.js chạy chung tiến trình nhưng là hai bản module khác nhau.
// Registry trên globalThis cho phép trang quản trị, cửa hàng… báo cho server game khi dữ liệu người dùng đổi.

export interface GameServerHandle {
  /** Tải lại thông tin người dùng (tên, avatar, khóa tài khoản…) cho các kết nối đang mở. */
  refreshUser(userId: string): Promise<void>;
  /** Ngắt mọi kết nối của người dùng (vd. vừa bị khóa). */
  disconnectUser(userId: string): void;
}

const shared = globalThis as typeof globalThis & { __kydaiGameServer?: GameServerHandle };

export function registerGameServer(handle: GameServerHandle | undefined) {
  shared.__kydaiGameServer = handle;
}

export function getGameServer(): GameServerHandle | undefined {
  return shared.__kydaiGameServer;
}
