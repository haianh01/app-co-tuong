import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./engine";
import { detectShapes } from "./opening-shapes";

const ids = (fen: string, s: "r" | "b" = "r") => detectShapes(parseFen(fen).board, s).map((x) => x.id);

describe("detectShapes", () => {
  it("thế ban đầu chưa có hình nào", () => {
    expect(ids(START_FEN, "r")).toEqual([]);
    expect(ids(START_FEN, "b")).toEqual([]);
  });

  it("Ngũ thất Pháo: Pháo đầu kèm Pháo lộ 7", () => {
    expect(ids("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/2C1C4/9/RNBAKABNR w")).toContain("nguThatPhao");
  });

  it("Ngũ lục Pháo phía Đen (lộ đếm từ phía Đen)", () => {
    // Pháo đen cột 4 (lộ 5) và cột 5 (lộ 6).
    expect(ids("rnbakabnr/9/4cc3/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w", "b")).toContain("nguLucPhao");
  });

  it("Xe hoành và Xe tuần hà", () => {
    expect(ids("4k4/9/9/9/9/9/9/9/R8/4K4 w")).toContain("xeHoanh");
    expect(ids("4k4/9/9/9/9/R8/9/9/9/4K4 w")).toContain("xeTuanHa");
  });

  it("Pháo phong Xe chỉ tính khi Pháo đối phương có căn", () => {
    const bare = "4k4/9/9/9/9/9/1c7/9/9/1R2K4 w";
    const guarded = "4k4/9/9/9/2n6/9/1c7/9/9/1R2K4 w";
    expect(ids(bare)).not.toContain("phaoPhongXe");
    expect(ids(guarded)).toContain("phaoPhongXe");
  });

  it("Lưỡng đầu xà: Tốt 3 và Tốt 7 cùng tiến", () => {
    expect(ids("rnbakabnr/9/1c5c1/p1p1p1p1p/9/2P3P2/P3P3P/1C5C1/9/RNBAKABNR w")).toContain("luongDauXa");
  });

  it("Tượng biên bị đánh dấu là hình xấu", () => {
    const shape = detectShapes(parseFen("4k4/9/9/9/9/9/9/B8/9/4K4 w").board, "r").find((x) => x.id === "tuongBien");
    expect(shape?.bad).toBe(true);
  });
});

describe("thế tra cứu thêm", () => {
  it("Lôi công Pháo: Pháo về giữa cung mình", () => {
    expect(ids("4k4/9/9/9/9/9/9/9/4C4/3AKA3 w")).toContain("loiCongPhao");
  });

  it("Cái Mã tam chùy: Ngũ thất Pháo và Mã lên trung lộ", () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/4N4/P1P3P1P/2C1C4/9/R1BAKABNR w";
    expect(ids(fen)).toContain("caiMaTamChuy");
  });
});

describe("Quy bối Pháo", () => {
  // Pháo 2 bình 5, Mã 8 tiến 7 / Mã 2 tiến 3, Xe 9 tiến 1 / Xe 1 bình 2, Pháo 8 thoái 1 (theo vi.wikipedia).
  const fen = "rnbakab2/7cr/1c4n2/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKABR1 w";
  it("Đen lui Pháo 8 một bước trước Pháo đầu của Đỏ", () => {
    expect(ids(fen, "b")).toContain("quyBoiPhao");
  });
  it("không có Pháo đầu đối phương thì không tính", () => {
    expect(ids("rnbakab2/7cr/1c4n2/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w", "b")).not.toContain("quyBoiPhao");
  });
});
