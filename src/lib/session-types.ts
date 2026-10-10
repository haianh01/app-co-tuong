/** Thông tin người dùng mà client nhận từ /api/me. Dùng chung client và server. */
export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  rating: number;
  isGuest: boolean;
  isAdmin: boolean;
  coins: number;
  /** ms epoch hết hạn VIP, `null` nếu không phải VIP. */
  vipUntil: number | null;
  avatar: string;
  frame: string;
  boardSkin: string;
  pieceSkin: string;
  email: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  /** Đang bị khóa chơi online: lý do và thời hạn (ms epoch). */
  ban: { until: number; reason: string | null } | null;
}
