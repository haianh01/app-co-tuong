# Kế hoạch: Bình luận "kiểu đại sư" cho AI phân tích

> Cập nhật lần cuối: 2026-10-14. GĐ 1 đã hoàn thành.

## Mục tiêu
Đầu ra mới đọc như một người thầy đang giảng — 5 khối: Nhận định → Đối phương muốn → Kế hoạch → Nước so sánh → Bài học.

## Thứ tự ưu tiên

| GĐ | Nội dung | Ước lượng | Trạng thái |
|---|---|---|---|
| **1** | Bộ ghép câu (`commentary.ts`) | 1 ngày | ✅ XONG (24 tests xanh) |
| **2** | Ý đồ đối phương | 0,5 ngày | TODO |
| **3** | Kế hoạch theo giai đoạn | 1 ngày | TODO |
| **5** | Thuật ngữ và bài học (`glossary.ts`, `lessons.ts`) | 1–1,5 ngày | TODO |
| **4** | Nước so sánh (engine refute) | 1 ngày | TODO |
| **6** | Giao diện (`PositionAnalysisModal`) | 0,5 ngày | TODO |

## Kiến trúc file mới
```
src/lib/xiangqi/
  commentary.ts      ← GĐ 1 ✅
  glossary.ts        ← GĐ 5
  lessons.ts         ← GĐ 5
  commentary.test.ts ← GĐ 1 ✅ 24 tests
```

## Lưu ý
- Phong cách "đại sư" là nguyên tắc chung — không trích từ sách cụ thể. Khi có tư liệu thật thì đối chiếu và chỉnh kho câu trong `commentary.ts` / `lessons.ts`.
- `dynamic=true`: không bịa lý do — nói thẳng "ưu thế đến từ tính toán chiến thuật".
- GĐ 4 thêm 1 lần gọi engine → cần cache theo FEN, giới hạn ~30k nodes.
