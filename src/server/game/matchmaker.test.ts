import { describe, expect, it } from "vitest";
import type { PlayerInfo, QueueKey } from "@/lib/online/protocol";
import { Matchmaker, ratingWindow } from "./matchmaker";

const player = (id: string, rating: number): PlayerInfo => ({
  id, username: id, displayName: id, rating, isGuest: false, avatar: "tuong-do", frame: "none",
});
const RATED: QueueKey = { variant: "xiangqi", tc: "10+0", rated: true };
const CASUAL: QueueKey = { variant: "xiangqi", tc: "10+0", rated: false };
const T0 = 1_000_000;

describe("Matchmaker", () => {
  it("ghép ngay hai người Elo gần nhau", () => {
    const m = new Matchmaker();
    m.add(player("a", 1500), RATED, T0);
    m.add(player("b", 1560), RATED, T0);
    const pairs = m.takePairs(T0);
    expect(pairs.map(([x, y]) => [x.user.id, y.user.id])).toEqual([["a", "b"]]);
    expect(m.size).toBe(0);
  });

  it("chênh Elo nhiều thì phải chờ khoảng chấp nhận nới rộng", () => {
    const m = new Matchmaker();
    m.add(player("a", 1500), RATED, T0);
    m.add(player("b", 1800), RATED, T0);
    expect(m.takePairs(T0 + 5_000)).toHaveLength(0);
    expect(ratingWindow(m.find("a")!, T0 + 20_000)).toBe(300);
    expect(m.takePairs(T0 + 20_000)).toHaveLength(1);
  });

  it("ưu tiên đối thủ Elo gần nhất", () => {
    const m = new Matchmaker();
    m.add(player("a", 1500), RATED, T0);
    m.add(player("xa", 1590), RATED, T0 + 1);
    m.add(player("gan", 1510), RATED, T0 + 2);
    const [pair] = m.takePairs(T0 + 3);
    expect([pair[0].user.id, pair[1].user.id]).toEqual(["a", "gan"]);
    expect(m.find("xa")).not.toBeNull();
  });

  it("ván không tính điểm ghép bất kể Elo; khác hàng đợi thì không ghép", () => {
    const m = new Matchmaker();
    m.add(player("a", 1000), CASUAL, T0);
    m.add(player("b", 2400), RATED, T0);
    expect(m.takePairs(T0)).toHaveLength(0);
    m.add(player("c", 2400), CASUAL, T0);
    expect(m.takePairs(T0)).toHaveLength(1);
  });

  it("vào hàng đợi mới thì rời hàng đợi cũ", () => {
    const m = new Matchmaker();
    m.add(player("a", 1500), RATED, T0);
    m.add(player("a", 1500), CASUAL, T0);
    expect(m.size).toBe(1);
    expect(m.find("a")!.key.rated).toBe(false);
    m.remove("a");
    expect(m.size).toBe(0);
  });
});
