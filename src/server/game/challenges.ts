// Lời mời "phòng bạn bè": người mời tạo mã, gửi link cho bạn; bạn mở link và nhận lời là vào ván.
// Giữ trong RAM (mất khi khởi động lại server — người mời chỉ cần tạo lại).

import { randomBytes } from "node:crypto";
import type { ChallengeColor, ChallengeInfo, PlayerInfo, QueueKey } from "@/lib/online/protocol";

const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const CHALLENGE_TTL_MS = 30 * 60_000;

export class ChallengeBook {
  private readonly byCode = new Map<string, ChallengeInfo>();
  private readonly byUser = new Map<string, string>();

  /** Tạo lời mời mới (thay lời mời cũ của cùng người, nếu có). */
  create(by: PlayerInfo, key: QueueKey, color: ChallengeColor, now: number): ChallengeInfo {
    this.cancel(by.id);
    let code = newCode();
    while (this.byCode.has(code)) code = newCode();
    const c: ChallengeInfo = { code, by, ...key, color, createdAt: now, expiresAt: now + CHALLENGE_TTL_MS };
    this.byCode.set(code, c);
    this.byUser.set(by.id, code);
    return c;
  }

  get(code: string, now: number): ChallengeInfo | null {
    const c = this.byCode.get(code);
    if (!c) return null;
    if (c.expiresAt <= now) {
      this.remove(c);
      return null;
    }
    return c;
  }

  ofUser(userId: string, now: number): ChallengeInfo | null {
    const code = this.byUser.get(userId);
    return code ? this.get(code, now) : null;
  }

  cancel(userId: string): ChallengeInfo | null {
    const code = this.byUser.get(userId);
    const c = code ? this.byCode.get(code) : undefined;
    if (!c) return null;
    this.remove(c);
    return c;
  }

  /** Cập nhật thông tin người mời (đổi tên, avatar, Elo) để trang mời hiển thị đúng. */
  updateUser(user: PlayerInfo) {
    const code = this.byUser.get(user.id);
    const c = code ? this.byCode.get(code) : undefined;
    if (c) c.by = user;
  }

  /** Dọn lời mời hết hạn; trả về các lời mời vừa bị xóa. */
  sweep(now: number): ChallengeInfo[] {
    const gone: ChallengeInfo[] = [];
    for (const c of this.byCode.values()) {
      if (c.expiresAt <= now) {
        this.remove(c);
        gone.push(c);
      }
    }
    return gone;
  }

  private remove(c: ChallengeInfo) {
    this.byCode.delete(c.code);
    if (this.byUser.get(c.by.id) === c.code) this.byUser.delete(c.by.id);
  }
}

function newCode() {
  return Array.from(randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
