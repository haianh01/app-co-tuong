import { describe, expect, it } from "vitest";
import {
  extractExpertEvaluation,
  extractExpertSuggestedMove,
  extractExpertTacticalThemes,
} from "../../../scripts/compare-expert-commentary";

describe("extractExpertEvaluation", () => {
  it("nhận diện đúng cán cân tiếng Trung (Red advantage)", () => {
    expect(extractExpertEvaluation("红方占优，黑车受制")).toBe("r");
    expect(extractExpertEvaluation("红方略优，局势主动")).toBe("r");
    expect(extractExpertEvaluation("红方优势，准备沉炮攻象")).toBe("r");
    expect(extractExpertEvaluation("先手胜势")).toBe("r");
    expect(extractExpertEvaluation("至此红优")).toBe("r");
  });

  it("nhận diện đúng cán cân tiếng Trung (Black advantage)", () => {
    expect(extractExpertEvaluation("黑方占优，红方子力受困")).toBe("b");
    expect(extractExpertEvaluation("黑方略优")).toBe("b");
    expect(extractExpertEvaluation("黑方胜势")).toBe("b");
    expect(extractExpertEvaluation("至此黑方满意，局势大好")).toBe("b");
    expect(extractExpertEvaluation("黑优")).toBe("b");
  });

  it("nhận diện đúng cán cân tiếng Trung (Draw / Balance)", () => {
    expect(extractExpertEvaluation("局势平稳，互有顾忌")).toBe("draw");
    expect(extractExpertEvaluation("双方均势")).toBe("draw");
    expect(extractExpertEvaluation("双方不变作和")).toBe("draw");
    expect(extractExpertEvaluation("最后和棋")).toBe("draw");
  });

  it("nhận diện đúng cán cân tiếng Việt (Red advantage)", () => {
    expect(extractExpertEvaluation("Bên Đỏ chiếm ưu thế rõ rệt")).toBe("r");
    expect(extractExpertEvaluation("Đỏ hơi ưu, dễ đi hơn")).toBe("r");
    expect(extractExpertEvaluation("Bên Tiên chủ động tấn công")).toBe("r");
    expect(extractExpertEvaluation("Đỏ nắm giữ tiên thủ")).toBe("r");
  });

  it("nhận diện đúng cán cân tiếng Việt (Black advantage)", () => {
    expect(extractExpertEvaluation("Bên Đen chiếm ưu lớn")).toBe("b");
    expect(extractExpertEvaluation("Đến đây bên Đen mãn ý")).toBe("b");
    expect(extractExpertEvaluation("Cờ tàn Đen tốt hơn")).toBe("b");
    expect(extractExpertEvaluation("Đen dễ đi, thế trận thoải mái")).toBe("b");
  });

  it("nhận diện đúng trạng thái hòa / cân bằng tiếng Việt", () => {
    expect(extractExpertEvaluation("Cục diện cân bằng, hai bên ngang sức")).toBe("draw");
    expect(extractExpertEvaluation("Hai bên ngang nhau, hòa cờ")).toBe("draw");
    expect(extractExpertEvaluation("Thế trận bình ổn")).toBe("draw");
  });

  it("fail-closed với câu phủ định hoặc mất ưu thế", () => {
    // Không được nhận diện là Đỏ ưu khi câu viết 'ưu thế dần mất'
    expect(extractExpertEvaluation("Tướng Đỏ ưu thế dần mất, Đỏ đành chịu thua")).not.toBe("r");
    expect(extractExpertEvaluation("Nước đi thông thường trong bố cục trung pháo")).toBe("unclear");
    expect(extractExpertEvaluation("Mỗi bên đánh một cánh gay cấn")).toBe("unclear");
  });
});

describe("extractExpertSuggestedMove", () => {
  it("trích xuất đúng nước cờ viết tắt tiếng Việt (V/C/M/X)", () => {
    expect(extractExpertSuggestedMove("Ứng đi C9.1 tróc pháo thì M8.9")).toBe("B9.1");
    expect(extractExpertSuggestedMove("Trắng như đổi thành V3.5 trận hình đa biến")).toBe("T3.5");
    expect(extractExpertSuggestedMove("Bên đen có thể đi X2.1 tróc đôi")).toBe("X2.1");
    expect(extractExpertSuggestedMove("Không bằng đi M4/5 bảo toàn thực lực")).toBe("M4/5");
  });

  it("trích xuất đúng nước cờ viết bằng chữ tiếng Việt", () => {
    expect(extractExpertSuggestedMove("Đỏ nếu sửa đi xe chín bình hai thì cuộc cờ bình ổn")).toBe("X9-2");
    expect(extractExpertSuggestedMove("Bên Đen nên đi pháo 2 tiến 5")).toBe("P2.5");
    expect(extractExpertSuggestedMove("Thay vì đi mã hai thoái ba")).toBe("M2/3");
  });

  it("trích xuất đúng nước cờ chữ Hán", () => {
    expect(extractExpertSuggestedMove("如改走车二进六，则炮5平2")).toBe("X2.6");
    expect(extractExpertSuggestedMove("不如改走马四进六，局势大好")).toBe("M4.6");
    expect(extractExpertSuggestedMove("改走卒5进1渡河")).toBe("B5.1");
  });

  it("không nhận nước đối phó / đáp trả (则 / tắc)", () => {
    expect(extractExpertSuggestedMove("tắc pháo 2 tiến 5, xe 8 tiến 1")).toBeNull();
    expect(extractExpertSuggestedMove("则炮5平2，车八平五")).toBeNull();
  });

  it("trả về null khi không có nước cờ hợp lệ", () => {
    expect(extractExpertSuggestedMove("Đoạn cuối ván cờ diễn ra rất nhanh")).toBeNull();
    expect(extractExpertSuggestedMove("Nên đi thật cẩn thận")).toBeNull();
  });
});

describe("extractExpertTacticalThemes", () => {
  it("nhận diện đúng các chủ đề chiến thuật song ngữ", () => {
    expect(extractExpertTacticalThemes("Đen khí tốt đả loạn trận hình")).toContain("Thí quân");
    expect(extractExpertTacticalThemes("弃车抢攻强取陆伟韬")).toContain("Thí quân");
    expect(extractExpertTacticalThemes("Tiến xe diệu đoái")).toContain("Đổi quân");
    expect(extractExpertTacticalThemes("兑车避免被动")).toContain("Đổi quân");
    expect(extractExpertTacticalThemes("Gác sĩ củng cố trận hình")).toContain("Hóa giải");
    expect(extractExpertTacticalThemes("Trói buộc xe mã đối phương")).toContain("Bó quân");
  });
});
