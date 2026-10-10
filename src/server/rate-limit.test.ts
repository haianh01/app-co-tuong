// Giới hạn tần suất (dùng cho khóa đăng nhập sai nhiều lần). Thời gian truyền vào tay nên không phải chờ thật.

import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

const MIN = 60_000;
const size = (l: RateLimiter) => (l as unknown as { hits: Map<string, number[]> }).hits.size;

describe("RateLimiter", () => {
  it("cho phép đủ `limit` lần trong cửa sổ, lần sau bị chặn", () => {
    const l = new RateLimiter(3, MIN);
    expect([l.hit("a", 0), l.hit("a", 1), l.hit("a", 2)]).toEqual([true, true, true]);
    expect(l.hit("a", 3)).toBe(false);
    expect(l.blocked("a", 3)).toBe(true);
  });

  it("cửa sổ trượt: lần ghi cũ nhất hết hạn đúng sau windowMs", () => {
    const l = new RateLimiter(2, MIN);
    l.hit("a", 0);
    l.hit("a", 10_000);
    expect(l.hit("a", MIN - 1)).toBe(false);
    expect(l.hit("a", MIN)).toBe(true); // lần ở t=0 vừa hết hạn
    expect(l.hit("a", MIN + 1)).toBe(false); // lần ở t=10s vẫn còn
    expect(l.hit("a", 10_000 + MIN)).toBe(true);
  });

  it("lần bị chặn không được tính, nên thời gian khóa không bị kéo dài mãi", () => {
    const l = new RateLimiter(2, MIN);
    l.hit("a", 0);
    l.hit("a", 0);
    for (let t = 1; t < MIN; t += 5_000) expect(l.hit("a", t)).toBe(false);
    expect(l.hit("a", MIN)).toBe(true);
  });

  it("blocked() chỉ kiểm tra, không ghi nhận thêm", () => {
    const l = new RateLimiter(2, MIN);
    l.hit("a", 0);
    for (let i = 0; i < 10; i++) expect(l.blocked("a", 1)).toBe(false);
    expect(l.hit("a", 1)).toBe(true);
    expect(l.blocked("a", 1)).toBe(true);
    expect(l.blocked("a", MIN + 1)).toBe(false);
  });

  it("khóa chưa từng gặp thì không bị chặn", () => {
    expect(new RateLimiter(1, MIN).blocked("la", 0)).toBe(false);
  });

  it("các khóa độc lập với nhau", () => {
    const l = new RateLimiter(1, MIN);
    expect(l.hit("anh", 0)).toBe(true);
    expect(l.hit("anh", 1)).toBe(false);
    expect(l.hit("binh", 1)).toBe(true);
  });

  it("reset xóa lịch sử của một khóa (vd. đăng nhập đúng thì xóa số lần sai)", () => {
    const l = new RateLimiter(1, MIN);
    l.hit("anh", 0);
    l.hit("binh", 0);
    l.reset("anh");
    expect(l.blocked("anh", 1)).toBe(false);
    expect(l.blocked("binh", 1)).toBe(true);
  });

  it("thiết lập khóa đăng nhập thực tế: sai 10 lần trong 15 phút thì khóa tới khi lần sai đầu hết hạn", () => {
    const l = new RateLimiter(10, 15 * MIN);
    for (let i = 0; i < 10; i++) l.hit("anh", i * MIN);
    expect(l.blocked("anh", 9 * MIN + 1)).toBe(true);
    expect(l.blocked("anh", 15 * MIN - 1)).toBe(true);
    expect(l.blocked("anh", 15 * MIN)).toBe(false);
  });

  it("dọn các khóa đã hết hạn khi bảng quá 10.000 khóa (không phình RAM)", () => {
    const l = new RateLimiter(5, MIN);
    for (let i = 0; i <= 10_000; i++) l.hit(`k${i}`, 0);
    expect(size(l)).toBe(10_001); // chưa khóa nào hết hạn: giữ nguyên
    l.hit("moi", MIN);
    expect(size(l)).toBe(1);
    expect(l.blocked("moi", MIN)).toBe(false);
  });

  it("thời gian mặc định là Date.now()", () => {
    const l = new RateLimiter(1, MIN);
    expect(l.hit("a")).toBe(true);
    expect(l.hit("a")).toBe(false);
    expect(l.blocked("a")).toBe(true);
  });
});
