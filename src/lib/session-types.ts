/** Thông tin người dùng mà client nhận từ /api/me. Dùng chung client và server. */
export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  rating: number;
}
