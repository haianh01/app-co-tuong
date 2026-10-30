import { describe, expect, it } from "vitest";
import { speakNotation, parseStageRoom } from "./narration";
import { splitSentences, cleanForSpeech } from "./tts";
import path from "node:path";
import { createSearch, fold, loadKnowledge } from "./knowledge";
import { describeBoard, movesFromNotations } from "./postgame";
import { replayMoves } from "@/lib/xiangqi/game";

describe("live bot - narration and helpers", () => {
  it("converts xiangqi notation to natural Vietnamese speech", () => {
    expect(speakNotation("P2-5")).toBe("Pháo 2 bình 5");
    expect(speakNotation("M8.7")).toBe("Mã 8 tiến 7");
    expect(speakNotation("X4/2")).toBe("Xe 4 thoái 2");
    expect(speakNotation("Xt.3")).toBe("Xe trước tiến 3");
    expect(speakNotation("invalid")).toBe("invalid");
  });

  it("extracts stage room ID correctly", () => {
    expect(
      parseStageRoom("http://localhost:3000/tuong-thuat/san-khau?room=abc123xyz_test_456"),
    ).toBe("abc123xyz_test_456");

    expect(parseStageRoom("abc123xyz_test_456")).toBe("abc123xyz_test_456");
    expect(parseStageRoom("short")).toBeNull();
  });

  it("cleans and splits sentences for TTS properly", () => {
    const raw = "Pháo 2 bình 5 & Mã 8 tiến 7! Nước cờ rất hay. 👍";
    const cleaned = cleanForSpeech(raw);
    expect(cleaned).toContain("và");
    expect(cleaned).not.toContain("&");
    expect(cleaned).not.toContain("👍");

    const text = "Chào bạn nha! Hôm nay đánh cờ thế nào rồi? Chúc bạn buổi tối vui vẻ.";
    const parts = splitSentences(text);
    expect(parts.length).toBeGreaterThanOrEqual(1);
  });

  it("nạp kho kiến thức: bài Triệu Hâm Hâm, sổ khai cuộc và bài giảng .md", () => {
    const k = loadKnowledge(path.resolve(process.cwd(), "docs/transcripts"));
    expect(k.items.filter((it) => it.group.startsWith("ky_ly_")).length).toBe(144);
    expect(k.items.some((it) => it.group === "so_khai_cuoc")).toBe(true);
    expect(k.names.length).toBeGreaterThan(4);
  });
});

describe("live bot - tìm kiến thức theo câu hỏi", () => {
  const search = createSearch(loadKnowledge(path.resolve(process.cwd(), "docs/transcripts")).items);

  it("bỏ dấu để khớp bình luận gõ không dấu", () => {
    expect(fold("Pháo đầu Bình Phong Mã!")).toBe("phao dau binh phong ma");
  });

  it("chỉ gửi mục liên quan, gói theo nhóm, không quá ngân sách", () => {
    const r = search.search("Thuận pháo với nghịch pháo khác nhau thế nào?");
    expect(r).toContain("Thuận Pháo - Liệt Pháo - Nghịch Pháo");
    expect(r.length).toBeLessThanOrEqual(4000 + 200);
    expect(search.search("Tàn cuộc mã tốt thắng sĩ tượng toàn không?")).toContain("<ky_ly_tan_cuoc>");
  });

  it("hiểu cách nói của người xem: không dấu, chốt = Tốt, ra xe = xuất Xe", () => {
    expect(search.search("phao dau thi den nen di gi")).toContain("Pháo đầu");
    expect(search.search("xe ra sớm có tốt không")).toContain("Xuất Xe");
    expect(search.search("chốt qua sông có mạnh không")).toContain("Binh qua sông");
  });

  it("câu ngoài lề không kèm kiến thức", () => {
    expect(search.search("hello anh ăn cơm chưa")).toBe("");
    expect(search.search("anh chủ kênh đánh hay ghê")).toBe("");
  });
});

describe("live bot - bình ván", () => {
  it("dịch ký hiệu nước về tọa độ, dừng ở nước không hợp lệ", () => {
    expect(movesFromNotations(["P2-5", "M8.7", "M2.3"])).toHaveLength(3);
    expect(movesFromNotations(["P2-5", "X1.5", "M2.3"])).toHaveLength(1);
  });

  it("tả thế cờ: cột đếm từ phải theo phía mỗi bên, hàng 1 là hàng đáy", () => {
    const start = describeBoard(replayMoves([]).history[0].board);
    expect(start).toContain("Đỏ: Tướng cột 5 hàng 1");
    expect(start).toContain("Đen: Tướng cột 5 hàng 1");
    expect(start).toContain("Pháo cột 2 hàng 3");
    const after = describeBoard(replayMoves(movesFromNotations(["P2-5"])).history[1].board);
    expect(after).toContain("Pháo cột 5 hàng 3");
  });
});
