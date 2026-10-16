import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./engine";
import { classifyOpeningType, detectShapes } from "./opening-shapes";

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

describe("Xe trực, Xe lộ 3–7, Song biên Pháo, Phi Tượng tiến Tốt giữa", () => {
  it("Xe trực là Xe bình sang lộ 2/8, không phải Xe tiến lộ biên", () => {
    // Xe 1 bình 2: Xe đỏ từ cột 8 sang cột 7 hàng đáy (Mã đã nhảy ra).
    expect(ids("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C4NC1/9/RNBAKABR1 w")).toContain("xeTruc");
    expect(ids("4k4/9/9/9/9/9/R8/9/9/4K4 w")).not.toContain("xeTruc");
  });

  it("Xe lộ 3–7", () => {
    expect(ids("4k4/9/9/9/9/9/6R2/9/9/4K4 w")).toContain("xeTamThat");
  });

  it("Song biên Pháo", () => {
    expect(ids("4k4/9/9/9/9/9/9/C7C/9/4K4 w")).toContain("songBienPhao");
  });

  it("Phi Tượng tiến Tốt giữa", () => {
    expect(ids("4k4/9/9/9/9/4P4/9/4B4/9/4K4 w")).toContain("phiTuongTrungBinh");
    expect(ids("4k4/9/9/9/9/9/4P4/4B4/9/4K4 w")).not.toContain("phiTuongTrungBinh");
  });
});

describe("Xe công Mã, đại/tiểu xuất Xe (bài 11, 27)", () => {
  it("Xe đè Mã tận gốc: Xe đứng chân Mã còn ở nhà", () => {
    // Xe đỏ cột 7 hàng 1, ngay trước Mã đen cột 7 hàng 0 (Xe 2 tiến 8).
    expect(ids("rnbakabnr/7R1/1c5c1/9/9/9/9/9/9/4K4 w")).toContain("xeDeMa");
  });

  it("Xe qua hà áp Mã: Xe chặn chân Mã đã ra", () => {
    // Mã đen cột 6 hàng 2, Xe đỏ đứng chân Mã ở hàng 3.
    expect(ids("4k4/9/6n2/6R2/9/9/9/9/9/4K4 w")).toContain("xeApMa");
  });

  it("Đại xuất Xe và Tiểu xuất Xe", () => {
    expect(ids("4k4/9/9/8R/9/9/9/9/9/4K4 w")).toContain("daiXuatXe");
    expect(ids("4k4/9/9/9/9/9/8R/9/9/4K4 w")).toContain("tieuXuatXe");
  });
});

describe("classifyOpeningType (bài 2)", () => {
  const start = parseFen(START_FEN).board;
  it("Pháo đầu: hoãn công, Xe qua sông thì cấp công", () => {
    expect(classifyOpeningType("P2-5", start)).toBe("hoanCong");
    expect(classifyOpeningType("P2-5", parseFen("rnbakabnr/9/1c5c1/p1p1p1R1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABN1 w").board)).toBe("capCong");
  });
  it("Tiên nhân chỉ lộ là linh hoạt, Phi Tượng là tán thủ", () => {
    expect(classifyOpeningType("B3.1", start)).toBe("linhHoat");
    expect(classifyOpeningType("T3.5", start)).toBe("tanThu");
    // Trung binh là khai cuộc riêng, không phải Pháo đầu
    expect(classifyOpeningType("B5.1", start)).toBe("tanThu");
  });
});
