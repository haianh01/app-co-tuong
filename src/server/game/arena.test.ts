import { describe, expect, it } from "vitest";
import type { PlayerInfo } from "@/lib/online/protocol";
import { ARENA_REST_MS, ArenaPool } from "./arena";

const p = (id: string, rating = 1500): PlayerInfo => ({
  id, username: id, displayName: id.toUpperCase(), rating, isGuest: false, avatar: "tuong-do", frame: "none",
});
const ARENA = { id: "a20261010to", minutes: 5, increment: 3, variant: "xiangqi", endsAt: 10_000_000 };
const all = () => true;
const names = (pairs: ReturnType<ArenaPool["pair"]>) => pairs.map((x) => [x.red.id, x.black.id].sort().join("-")).sort();

function pool() {
  const a = new ArenaPool();
  a.sync([ARENA]);
  return a;
}

describe("ghép cặp Arena", () => {
  it("ghép người điểm gần nhau; người lẻ chờ lượt sau", () => {
    const a = pool();
    a.setReady(ARENA.id, p("u1"), 10);
    a.setReady(ARENA.id, p("u2"), 0);
    a.setReady(ARENA.id, p("u3"), 9);
    a.setReady(ARENA.id, p("u4"), 1);
    a.setReady(ARENA.id, p("u5"), 5);
    const pairs = a.pair(0, all);
    expect(names(pairs)).toEqual(["u1-u3", "u4-u5"]);
  });

  it("chỉ ghép người đang trực tuyến và không bận ván khác", () => {
    const a = pool();
    for (const id of ["u1", "u2", "u3"]) a.setReady(ARENA.id, p(id), 0);
    expect(names(a.pair(0, (id) => id !== "u2"))).toEqual(["u1-u3"]);
  });

  it("vừa đấu xong được nghỉ vài giây; không gặp lại đối thủ vừa đấu nếu còn người khác", () => {
    const a = pool();
    for (const id of ["u1", "u2", "u3", "u4"]) a.setReady(ARENA.id, p(id), 0);
    a.finished(ARENA.id, "u1", "u2", { u1: 2, u2: 0 }, 1000);
    a.finished(ARENA.id, "u3", "u4", { u3: 2, u4: 0 }, 1000);
    expect(a.pair(1000 + ARENA_REST_MS - 1, all)).toEqual([]);
    // u1, u3 cùng 2 điểm; u2, u4 cùng 0 điểm: ghép chéo, không lặp lại cặp cũ.
    expect(names(a.pair(1000 + ARENA_REST_MS, all))).toEqual(["u1-u3", "u2-u4"]);
  });

  it("chỉ còn đúng đối thủ cũ thì vẫn ghép (không bắt chờ mãi)", () => {
    const a = pool();
    a.setReady(ARENA.id, p("u1"), 0);
    a.setReady(ARENA.id, p("u2"), 0);
    a.finished(ARENA.id, "u1", "u2", {}, 0);
    expect(names(a.pair(ARENA_REST_MS, all))).toEqual(["u1-u2"]);
  });

  it("luân phiên màu quân: ai vừa cầm Đỏ thì ván sau cầm Đen", () => {
    const a = pool();
    a.setReady(ARENA.id, p("u1"), 0);
    a.setReady(ARENA.id, p("u2"), 0);
    a.finished(ARENA.id, "u1", "u2", {}, 0);
    for (let i = 0; i < 5; i++) {
      const [pair] = a.pair(ARENA_REST_MS * (2 * i + 1), all);
      const expected = i % 2 === 0 ? "u2" : "u1";
      expect(pair.red.id).toBe(expected);
      a.finished(ARENA.id, pair.red.id, pair.black.id, {}, ARENA_REST_MS * (2 * i + 1));
    }
  });

  it("tạm nghỉ thì không được ghép; quay lại vẫn nhớ đối thủ cũ; hết giờ giải thì ngừng ghép", () => {
    const a = pool();
    a.setReady(ARENA.id, p("u1"), 0);
    a.setReady(ARENA.id, p("u2"), 0);
    a.unready(ARENA.id, "u2");
    expect(a.pair(0, all)).toEqual([]);
    a.setReady(ARENA.id, p("u2"), 0);
    expect(a.pair(ARENA.endsAt, all)).toEqual([]);
    expect(names(a.pair(0, all))).toEqual(["u1-u2"]);
  });

  it("giải bị gỡ khỏi danh sách đang chạy thì không ghép nữa", () => {
    const a = pool();
    a.setReady(ARENA.id, p("u1"), 0);
    a.setReady(ARENA.id, p("u2"), 0);
    a.sync([]);
    expect(a.pair(0, all)).toEqual([]);
  });
});
