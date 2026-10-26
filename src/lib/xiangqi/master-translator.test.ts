import { describe, expect, it } from "vitest";
import {
  translatePlayer,
  translateEccoName,
  getMasterDisplayName,
} from "./master-translator";

describe("master-translator", () => {
  it("dịch đúng tên kỳ thủ và tỉnh thành sang Hán-Việt", () => {
    const p1 = translatePlayer("吉林 栾枫");
    expect(p1.fullName).toBe("Cát Lâm: Loan Phong");
    expect(p1.playerName).toBe("Loan Phong");

    const p2 = translatePlayer("上海 谢靖");
    expect(p2.fullName).toBe("Thượng Hải: Tạ Tĩnh");
    expect(p2.title).toBe("Đặc cấp Đại sư");

    const p3 = translatePlayer("广东 许银川");
    expect(p3.fullName).toBe("Quảng Đông: Hứa Ngân Xuyên");
    expect(p3.title).toContain("Kỳ vương");

    const p4 = translatePlayer("浙江 赵鑫鑫");
    expect(p4.fullName).toBe("Chiết Giang: Triệu Hâm Hâm");
    expect(p4.title).toContain("Lục Mạch Thần Kiếm");
  });

  it("dịch chuẩn xác các hệ khai cuộc ECCO phổ biến", () => {
    const e1 = translateEccoName("中炮七路马对屏风马 红进中兵对黑双炮过河", "C04");
    expect(e1).toContain("Trung pháo thất lộ mã đối Bình phong mã");
    expect(e1).toContain("tiến trung binh");
    expect(e1).toContain("song pháo quá hà");

    const e2 = translateEccoName("顺炮横车对直车巡河", "D01");
    expect(e2).toBe("Thuận pháo hoành xa đối trực xa tuần hà");

    const e3 = translateEccoName("飞相进三兵对进右马", "A01");
    expect(e3).toBe("Phi tượng tiến tam binh đối tiến hữu mã");
  });

  it("chuyển đổi ID đại sư cho bộ lọc", () => {
    expect(getMasterDisplayName("Xu Yinchuan")).toContain("Hứa Ngân Xuyên");
    expect(getMasterDisplayName("Zhao Xinxin")).toContain("Triệu Hâm Hâm");
    expect(getMasterDisplayName("Lv Qin")).toContain("Lữ Khâm");
    expect(getMasterDisplayName("Hu Ronghua")).toContain("Hồ Vinh Hoa");
  });
});
