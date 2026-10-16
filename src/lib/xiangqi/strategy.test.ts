import { describe, expect, it } from "vitest";
import { START_FEN, legalMoves, parseFen, play, type Move, type Side } from "./engine";
import { explainText } from "./explain";
import { moveNotation } from "./notation";
import { choosePlan, coordination, detectOpeningFault, linkedGuards, principleScores, wingImbalance } from "./strategy";

const board = (fen: string) => parseFen(fen).board;

describe("choosePlan", () => {
  it("đầu ván, quân còn ở nhà: ra quân", () => {
    expect(choosePlan(board(START_FEN), "r", 0)).toBe("raQuan");
  });

  it("còn ít quân lớn: tàn cuộc", () => {
    expect(choosePlan(board("3k5/9/9/4p4/9/2P6/9/4B4/4A4/3AK1B2 w"), "r", 60)).toBe("tanCuoc");
  });

  it("lộ mở vào cung từ phần sân mình chưa phải tấn công (hồi quy B7.1)", () => {
    // Pháo đỏ bên sân mình và Xe ở hàng đáy nhìn dọc lộ trống vào cung Đen: không có quân nào qua sông ép cung
    const fen = "2bakabr1/3r5/4c1n2/p1p1n1p1p/9/4c1P2/P1P1N3P/2NCB3C/4A4/1RBAKR3 w";
    expect(choosePlan(board(fen), "r", 22)).not.toBe("tanCong");
  });

  it("Xe và Mã qua sông khống chế cung: tấn công", () => {
    const fen = "1rbakab2/9/1c5c1/3N5/4R4/9/9/1C5C1/9/2BAKABN1 w";
    expect(choosePlan(board(fen), "r", 40)).toBe("tanCong");
  });

  it("đối phương mất hết Sĩ Tượng giữa ván: tấn công", () => {
    expect(choosePlan(board("r3k4/9/2n1c4/p3p3p/9/2P6/P3P3P/1CN1C1N2/9/R2AKAB1R w"), "r", 40)).toBe("tanCong");
  });
});

describe("principleScores", () => {
  it("Xe lên hàng ngang thì thông đường hơn", () => {
    const home = principleScores(board(START_FEN), "r");
    const out = principleScores(board("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/8R/RNBAKABN1 b"), "r");
    expect(out.xe).toBeGreaterThan(home.xe);
  });

  it("đếm Tốt đã qua sông", () => {
    expect(principleScores(board("3k5/9/9/4P4/2P6/9/9/9/9/4K4 w"), "r").tot).toBe(2);
  });
});

describe("nguyên lý mới", () => {
  it("điểm then chốt: Pháo đầu và Mã hà khẩu", () => {
    // Pháo đỏ ở cột giữa, Mã đỏ ở hà khẩu (hàng 5, cột 6).
    const s = principleScores(board("4k4/9/9/9/9/6N2/9/4C4/9/4K4 w"), "r");
    expect(s.diemThenChot).toBe(2);
  });

  it("cắt liên lạc: đếm quân lớn đối phương không có gốc", () => {
    // Xe đen bảo vệ Mã đen cùng hàng; Pháo đen đứng riêng không có gốc.
    const s = principleScores(board("3k5/9/r1n6/9/6c2/9/9/9/9/4K4 w"), "r");
    expect(s.catLienLac).toBe(2); // Xe (không ai giữ) và Pháo; Mã có Xe giữ
  });

  it("khống chế Tướng: Xe chiếm hàng trước mặt Tướng đối phương", () => {
    const free = principleScores(board("4k4/9/9/9/9/9/9/9/9/3K5 w"), "r").khongCheTuong;
    const held = principleScores(board("4k4/R8/9/9/9/9/9/9/9/3K5 w"), "r").khongCheTuong;
    expect(held).toBeGreaterThan(free);
  });
});

describe("nguyên lý kỳ lý bổ sung", () => {
  it("Mã đi biên bị trừ điểm", () => {
    const center = principleScores(board("4k4/9/9/9/9/9/9/2N6/9/4K4 w"), "r").maBien;
    const edge = principleScores(board("4k4/9/9/9/9/9/9/N8/9/4K4 w"), "r").maBien;
    expect(edge).toBeLessThan(center);
  });

  it("Sĩ Tượng liên hoàn: thế đầu ván có Tượng liên hoàn, chèn mắt Tượng thì mất", () => {
    expect(linkedGuards(board("4k4/9/9/9/9/9/9/4B4/9/2B1K4 w"), "r")).toBe(1);
    expect(linkedGuards(board("4k4/9/9/9/9/9/9/4B4/3N5/2B1K4 w"), "r")).toBe(0);
    expect(linkedGuards(board("4k4/9/9/9/9/9/9/9/4A4/3AK4 w"), "r")).toBe(1);
  });

  it("phối hợp: Xe một mình chưa tính, Xe cùng Mã ép cung thì tính", () => {
    expect(coordination(board("4k4/9/9/9/9/3R5/9/9/9/4K4 w"), "r")).toBe(0);
    expect(coordination(board("4k4/9/9/5N3/9/3R5/9/9/9/4K4 w"), "r")).toBe(2);
  });
});

describe("detectOpeningFault: lỗi hình cờ", () => {
  it("phi Tượng ra biên", () => {
    // Tượng đỏ cột 2 hàng 9 bay lên cột 0 hàng 7.
    const f = detectOpeningFault(board(START_FEN), { from: 83, to: 63 }, 2, "r", []);
    expect(f?.fault).toBe("edgeElephant");
  });

  it("phi Tượng về giữa không bị bắt lỗi", () => {
    expect(detectOpeningFault(board(START_FEN), { from: 83, to: 67 }, 2, "r", [])).toBeNull();
  });

  it("Mã thứ hai cũng ra biên", () => {
    // Mã đỏ trái đã ở biên (cột 0 hàng 7); Mã phải cột 7 nhảy ra cột 8 hàng 7.
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/NC5C1/9/R1BAKABNR w";
    expect(detectOpeningFault(board(fen), { from: 88, to: 71 }, 4, "r", [])?.fault).toBe("doubleEdgeHorse");
  });
});

describe("ba nguyên tắc khai cuộc và bổ Sĩ (bài 2, 14, 47)", () => {
  it("lệch cánh: một cánh ra đủ ba quân, cánh kia chưa động mà vẫn đi quân cánh đã ra", () => {
    // Đỏ: Pháo 2 bình 5, Mã 2 tiến 3, Xe 1 bình 2 (đúng kỳ lý), cánh trái còn nguyên.
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKABR1 w";
    expect(wingImbalance(board(fen), "r")).toBe(3);
    // Đi tiếp Xe 2 tiến 4 (cánh đã ra): lỗi lệch cánh.
    expect(detectOpeningFault(board(fen), { from: 88, to: 52 }, 6, "r", [])?.fault).toBe("oneWing");
    // Mã 8 tiến 9 (ra cánh trái): đúng như ví dụ bài 2, không lỗi.
    expect(detectOpeningFault(board(fen), { from: 82, to: 63 }, 6, "r", [])).toBeNull();
  });

  it("yếu đạo: Xe trực lộ 2/8 được tính", () => {
    const before = principleScores(board("4k4/9/9/9/9/9/9/9/9/4K3R w"), "r").yeuDao;
    const after = principleScores(board("4k4/9/9/9/9/9/9/9/9/4K2R1 w"), "r").yeuDao;
    expect(after).toBeGreaterThan(before);
  });

  it("Sĩ lên giữa cung chặn đường Xe hoành", () => {
    // Đen: Xe góc còn ở nhà, bổ Sĩ 6 tiến 5 (ô 5 → 13).
    const f = detectOpeningFault(board(START_FEN), { from: 5, to: 13 }, 3, "b", []);
    expect(f?.fault).toBe("advisorBlocksRook");
  });

  it("bổ Sĩ theo sách khai cuộc không bị chê", () => {
    // Biến sách trong openings.ts: Đen đi S4.5 ở nửa nước thứ 10 khi Xe góc còn ở nhà.
    const line = ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "X2.4", "S4.5"];
    let cur = board(START_FEN);
    const moves: Move[] = [];
    line.forEach((n, i) => {
      const turn: Side = i % 2 === 0 ? "r" : "b";
      const m = legalMoves({ board: cur, turn }).find((x) => moveNotation(cur, x) === n);
      if (!m) throw new Error(`không đi được ${n}`);
      moves.push(m);
      if (i < line.length - 1) cur = play(cur, m);
    });
    const last = moves[moves.length - 1];
    expect(detectOpeningFault(cur, last, line.length - 1, "b", moves.slice(0, -1))).toBeNull();
  });

  it("bổ Sĩ để đỡ chiếu không bị chê", () => {
    // Xe Đỏ chiếu theo cột Tướng Đen, Đen bổ Sĩ 6 tiến 5 (ô 5 → 13) để chặn.
    const b = board("rnbak1bnr/9/1c5c1/p1p1R1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABN1 b");
    expect(detectOpeningFault(b, { from: 5, to: 13 }, 5, "b", [])).toBeNull();
  });

});

/** Đi chuỗi nước theo ký hiệu từ thế đầu, trả về lỗi khai cuộc của nước cuối (kèm lịch sử để xét sách). */
function lineFault(line: string[]) {
  let cur = board(START_FEN);
  const moves: Move[] = [];
  line.forEach((n, i) => {
    const turn: Side = i % 2 === 0 ? "r" : "b";
    const m = legalMoves({ board: cur, turn }).find((x) => moveNotation(cur, x) === n);
    if (!m) throw new Error(`không đi được ${n}`);
    moves.push(m);
    if (i < line.length - 1) cur = play(cur, m);
  });
  const side: Side = (line.length - 1) % 2 === 0 ? "r" : "b";
  return detectOpeningFault(cur, moves[moves.length - 1], line.length - 1, side, moves.slice(0, -1));
}

describe("lỗi khai cuộc: trung lộ, Pháo sớm, Mã biên", () => {
  it("bỏ trung lộ: gặp Pháo đầu mà đi Tốt 3, Tốt đầu không có căn", () => {
    expect(lineFault(["P2-5", "B3.1"])?.fault).toBe("ignoreCenter");
  });

  it("lên Mã chính giữ Tốt đầu thì không lỗi", () => {
    expect(lineFault(["P2-5", "M8.7"])).toBeNull();
  });

  it("đặt Pháo đối (Thuận Pháo) thì không tính bỏ trung lộ, kể cả khi không có lịch sử để tra sách", () => {
    const b = board("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/4C2C1/9/RNBAKABNR b");
    expect(detectOpeningFault(b, { from: 25, to: 22 }, 1, "b")).toBeNull(); // P8-5
  });

  it("đã phi Tượng về giữa thì không tính bỏ trung lộ (Pháo ăn Tốt đầu sẽ bị kẹt)", () => {
    // Ván đại sư #10396: Tiên nhân chỉ lộ đối Tốt đế Pháo, Đen phi Tượng giữa rồi ra Xe, Tốt đầu để trống căn có chủ ý.
    expect(lineFault(["B7.1", "P2-3", "P2-5", "T3.5", "M8.9", "X9.1"])).toBeNull();
  });

  it("Pháo qua sông khi hai Mã còn nằm nhà", () => {
    expect(lineFault(["B7.1", "B3.1", "P2.4"])?.fault).toBe("earlyCannon");
  });

  it("đã ra một Mã thì Pháo lên không bị chê là xuất kích sớm", () => {
    expect(lineFault(["M2.3", "M8.7", "P8.4"])).toBeNull();
  });

  it("Pháo đầu nước 1 (bình Pháo bên sân mình) không phải xuất kích sớm", () => {
    expect(lineFault(["P2-5"])).toBeNull();
  });

  it("Mã ra biên khi chưa có Mã chính nào và ô Chính Mã còn trống", () => {
    expect(lineFault(["P2-5", "B3.1", "M8.9"])?.fault).toBe("edgeHorse");
  });

  it("Mã buộc ra biên vì ô Chính Mã đã có Pháo đứng thì không lỗi", () => {
    expect(lineFault(["P8-7", "B3.1", "M8.9"])).toBeNull();
  });

  it("mỗi lỗi mới có câu bình riêng, không dùng câu của ra Xe chậm", () => {
    expect(explainText([{ kind: "openingFault", fault: "ignoreCenter" }], "b")).toContain("trung lộ");
    expect(explainText([{ kind: "openingFault", fault: "earlyCannon" }], "r")).toContain("Mã");
    expect(explainText([{ kind: "openingFault", fault: "edgeHorse" }], "r")).toContain("Mã biên");
    for (const fault of ["ignoreCenter", "earlyCannon", "edgeHorse"] as const) {
      expect(explainText([{ kind: "openingFault", fault }], "r")).not.toContain("Xe");
    }
  });

  it("Biên Mã theo sách khai cuộc không bị chê", () => {
    // Sách: Pháo đầu, Đen lên Mã chính, Đỏ ra Mã chính rồi Đen ra Mã biên (2.1).
    expect(lineFault(["P2-5", "M8.7", "M2.3", "M2.1"])).toBeNull();
  });
});

describe("đi một quân nhiều lần: chỉ bắt lãng phí nước thật sự", () => {
  it("ra Xe hai bước (tiến 1 rồi bình hoành) là cách ra Xe bình thường", () => {
    expect(lineFault(["B3.1", "B3.1", "X9.1", "X9.1", "X9-4"])).toBeNull();
  });

  it("Mã tiến lần hai lên hà khẩu khi đã có Mã khác ra trận (ván đại sư #496)", () => {
    expect(lineFault(["T3.5", "M2.3", "B3.1", "B3.1", "M2.3", "M3.4"])).toBeNull();
  });

  it("Pháo lùi vì đang bị dọa không tính là lãng phí nước (ván đại sư #3411)", () => {
    expect(lineFault(["B7.1", "B7.1", "P2-3", "P8-5", "P8-5", "P5.4", "S6.5", "T3.5", "M8.7", "P5/2"])?.fault).not.toBe("repeatPiece");
  });

  it("Mã vừa ra lại lùi về chỗ cũ: đi tới lui", () => {
    expect(lineFault(["M2.3", "M8.7", "M3/2"])?.fault).toBe("repeatPiece");
  });

  it("Pháo đầu rồi lại bình Pháo đi khi chưa ra Mã nào là lãng phí nước", () => {
    expect(lineFault(["P2-5", "M8.7", "P5-4"])?.fault).toBe("repeatPiece");
  });
});

describe("ra Xe chậm và lệch cánh: không bắt nước ra quân / dựng thế thủ", () => {
  it("phi Tượng lần đầu khi Xe chưa ra không tính ra Xe chậm (ván đại sư #606)", () => {
    const f = lineFault(["P2-5", "M2.3", "M2.3", "P8-6", "B3.1", "M8.7", "X1-2", "B3.1", "M8.9", "T7.5"]);
    expect(f?.fault).not.toBe("lateRook");
  });

  it("ra Mã lần đầu ở nửa nước thứ 8 vẫn là đang ra quân, không tính ra Xe chậm", () => {
    const f = lineFault(["P2-5", "M8.7", "B3.1", "M2.3", "B7.1", "X9-8", "P8-6", "X1-2", "M2.3"]);
    expect(f?.fault).not.toBe("lateRook");
  });

  it("hai Xe còn ở góc mà vẫn tiến Tốt ở nửa nước thứ 8 là ra Xe chậm", () => {
    expect(lineFault(["P2-5", "M8.7", "M2.3", "X9-8", "B3.1", "M2.3", "P8-6", "X1-2", "B7.1"])?.fault).toBe("lateRook");
  });

  it("Xe bình sang hỗ trợ cánh chưa ra không tính lệch cánh (ván đại sư #771)", () => {
    expect(lineFault(["P2-5", "P8-5", "M2.3", "M8.7", "X1.1", "X9-8", "X1-6"])?.fault).not.toBe("oneWing");
  });

  it("tiến Tốt bên cánh chưa ra (mở đường cho Mã) không tính lệch cánh", () => {
    expect(lineFault(["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1"])?.fault).not.toBe("oneWing");
  });
});

describe("bổ Sĩ: chỉ chê khi thật sự chặn đường Xe hoặc quá sớm", () => {
  it("Xe đã tiến 1 để hoành mà bổ Sĩ lên giữa cung chặn hàng 2", () => {
    expect(lineFault(["B3.1", "B3.1", "X9.1", "X9.1", "S4.5"])?.fault).toBe("advisorBlocksRook");
  });

  it("Mã cạnh Xe đã ra (Xe ra trực được) thì bổ Sĩ giữa cung không chặn đường Xe (ván đại sư #2256)", () => {
    const f = lineFault(["P2-5", "M8.7", "M2.3", "X9-8", "B7.1", "B7.1", "M8.7", "M2.3", "M7.6", "P8-9", "X1.1", "S4.5"]);
    expect(f?.fault).not.toBe("advisorBlocksRook");
  });

  it("Xe trực đứng ở ô Mã là đã ra quân, không tính vào số quân nằm nhà (ván đại sư #2256)", () => {
    const f = lineFault(["P2-5", "M8.7", "M2.3", "X9-8", "B7.1", "B7.1", "M8.7", "M2.3", "M7.6", "P8-9", "X1.1", "S4.5"]);
    expect(f?.fault).not.toBe("earlyAdvisor");
  });

  it("bổ Sĩ phòng thủ khi Xe đối phương đã qua sông áp cung thì không chê", () => {
    // Xe đỏ lên hàng Tốt đen nhắm cung, Đen bổ Sĩ 4 tiến 5 (Mã cạnh Xe đen chưa ra).
    const b = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/5R3/9/P1P1P1P1P/1C5C1/9/RNBAKABN1 b").board;
    expect(detectOpeningFault(b, { from: 3, to: 13 }, 5, "b", [])).toBeNull();
  });
});
