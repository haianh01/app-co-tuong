// Đọc thế cờ ban đầu từ file kỳ phổ XQF (象棋演播室) và QP (định dạng "ccf0" của bộ 绝对精妙杀局).
// Chỉ lấy bày quân + tiêu đề, không đọc nước đi: lời giải do Pikafish tự tìm lại và kiểm chứng.

import { sq, type Board } from "../../src/lib/xiangqi/engine";

// Thứ tự 32 quân trong XQF: 车马相仕帅仕相马车炮炮兵兵兵兵兵, Đỏ trước rồi Đen.
const XQF_ORDER = "RNBAKABNRCCPPPPP";

const keyOf = (b: number) => (b * b * 54 + 221) & 0xff;

/** Giải mã bày quân XQF. Trả null khi file hỏng hoặc bày quân phi lý. */
export function decodeXqf(buf: Buffer): { board: Board; title: string; turn: "r" | "b" } | null {
  if (buf.length < 0x400 || buf[0] !== 0x58 || buf[1] !== 0x51) return null;
  const version = buf[2];
  const raw = [...buf.subarray(0x10, 0x30)];
  let xy = raw;
  if (version > 10) {
    const k = (keyOf(buf[13]) * buf[13]) & 0xff;
    if (version >= 12) {
      xy = Array(32).fill(0);
      for (let i = 0; i < 32; i++) xy[(k + i + 1) & 31] = raw[i];
    }
    xy = xy.map((v) => (v - k) & 0xff);
  }
  const board: Board = Array(90).fill(null);
  for (let i = 0; i < 32; i++) {
    const v = xy[i];
    if (v > 89) continue;
    const x = Math.floor(v / 10);
    const y = v % 10;
    if (x > 8) return null;
    const p = XQF_ORDER[i % 16];
    const at = sq(9 - y, x);
    if (board[at]) return null;
    board[at] = i < 16 ? p : p.toLowerCase();
  }
  // Tiêu đề: chuỗi Pascal GB18030 tại 0x50.
  const len = buf[0x50];
  const title = new TextDecoder("gb18030").decode(buf.subarray(0x51, 0x51 + Math.min(len, 63)));
  const turn = buf[0x32] === 1 ? "b" : "r";
  return { board, title, turn };
}

/** QP "ccf0": byte 5 = số quân, rồi bộ ba (loại, cột, hàng từ trên xuống). Loại 0–6 Đỏ, 7–13 Đen. */
export function decodeQp(buf: Buffer, types = "KABRNCP"): Board | null {
  if (buf.subarray(0, 4).toString("latin1") !== "ccf0") return null;
  const n = buf[5];
  if (buf.length < 6 + 3 * n) return null;
  const board: Board = Array(90).fill(null);
  for (let i = 0; i < n; i++) {
    const [t, x, y] = buf.subarray(6 + 3 * i, 9 + 3 * i);
    if (t > 13 || x > 8 || y > 9) return null;
    const at = sq(y, x);
    if (board[at]) return null;
    const p = types[t % 7];
    board[at] = t < 7 ? p : p.toLowerCase();
  }
  return board;
}
