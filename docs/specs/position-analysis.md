# Phân tích hình cờ (Position Analysis)

Khi người dùng bấm **"Phân tích hình cờ"**, hệ thống phân tích thế cờ hiện tại theo 6 tầng dưới đây.

## Tầng 1: Tính toán bằng engine (Pikafish)

- **MultiPV 3:** đưa ra 3 nước mạnh nhất, mỗi nước kèm chuỗi biến (PV) dài tối đa N nửa nước. Độ dài thực tế phụ thuộc giới hạn nodes.
- **Điểm số:** chênh lệch tính bằng cp, hoặc "sát sau N nước".
- **WDL:** xác suất Thắng – Hòa – Thua lấy trực tiếp từ engine (`UCI_ShowWDL`), không quy đổi từ cp.
- **Đòn dọa (null-move):** giả sử bên đang đi bỏ một lượt, engine tìm nước tốt nhất của đối phương. Nước đó chính là đòn dọa tiềm ẩn. Hiện chỉ lấy 1 phương án (`multipv: 1`, 40k nodes). Bỏ qua bước này khi bên đang đi bị chiếu.

## Tầng 2: Đánh giá cục diện theo 9 yếu tố (`assess.ts`)

Trả lời câu hỏi: **"Bên nào hơn, và vì sao?"** Hệ thống kết hợp điểm engine với 9 yếu tố, rồi chọn ra **3 lý do** đóng góp nhiều nhất:

1. **Vật chất (`vatChat`):** nói rõ chênh lệch cụ thể, ví dụ "Đỏ hơn 1 Xe 1 Tốt".
2. **An toàn của Tướng (`anToanTuong`):** Tướng lộ mặt, cung trống, hay cung vững.
3. **Hoạt động của Xe (`hoatDongXe`):** Xe chiếm lộ thông (cột không còn Tốt chắn, xác định theo thế cờ), Xe tuần hà, Xe áp bờ sông, hay Xe bị kìm.
4. **Hiệu quả của Mã (`hoatDongMa`):** Mã chiếm điểm cao, thoáng chân, hay bị cản chân / Mã chết.
5. **Pháo (`phao`):** Pháo đầu khống chế trung lộ, Pháo cắm đáy, hay Pháo mất ngòi.
6. **Tốt qua sông (`totQuaHa`):** Tốt qua hà khống chế điểm yếu, Tốt áp sát cung.
7. **Quân kém / quân treo (`quanKem`):** quân bị ghim, quân không có quân bảo vệ, thế quân rời rạc.
8. **Quyền chủ động (`sangKien`):** ưu tiên tính theo chuỗi nước ép buộc liên tục (chiếu tướng, bắt quân có lời) trích từ PV của engine (80 cp/nước ép). Khi không có PV (fallback tĩnh), chấm theo sức ép Cung tướng và độ cơ động tổng thể.
9. **Khuyết Sĩ Tượng (`khuyetSiTuong`):** gãy Sĩ thì dễ bị Xe Pháo khai thác, gãy Tượng thì dễ bị Mã thâm nhập.

*Cơ chế ưu thế động (`dynamic`):* nếu điểm engine cao (|evalCp| > 150) mà các yếu tố tĩnh giải thích không tới 40%, hệ thống nêu rõ ưu thế đến từ chuỗi biến chiến thuật sâu của engine (kèm lời thuật PV) thay vì gán ghép lý do tĩnh.

👉 Ví dụ hiển thị: *"Đỏ ưu thế lớn (+350 cp, {W}% thắng) nhờ: Xe chiếm lộ thông · Pháo đầu khống chế trung lộ · Đen khuyết Sĩ."* Trong đó {W} lấy từ WDL thật của engine.

## Tầng 3: Đòn dọa của đối phương (`threats.ts`)

Trả lời câu hỏi: **"Nếu ta sơ hở, đối phương đang dọa gì?"**

- **Dọa sát:** cảnh báo khi nước dọa của đối phương dẫn tới chiếu bí, hoặc khớp một hình sát ở Tầng 5.
- **Dọa bắt quân có lời:** bắt đôi, ghim, chiếu rút ăn quân.
- **Trạng thái đòn dọa:** `threat` là đang dọa. `parried` là nước được đề xuất đã hóa giải đòn dọa. `ignoredThreat` là nước người chơi vừa đi bỏ qua đòn dọa.
- **Hiển thị:** đánh dấu quân đang gặp nguy trên bàn cờ, kèm chuỗi nước đối phương sẽ khai thác.

## Tầng 4: Ý đồ của nước đi (`intent.ts`, `narrate.ts`)

Mỗi nước trong Top 3 được gắn một nhãn mục đích:

| Nhãn | Ý nghĩa |
|---|---|
| Đặt sát (`datSat`) | Dọa chiếu bí, hoặc trực tiếp chiếu bí |
| Lập hình (`lapHinh`) | Dựng một hình sát kinh điển |
| Ăn quân (`anQuan`) | Bắt quân có lời |
| Thí quân (`thiQuan`) | Mất quân ngay, nhưng cuối biến không thua vật chất hoặc chiếu bí được |
| Hóa giải (`hoaGiai`) | Giải chiếu, đỡ đòn dọa, cứu quân treo |
| Cải thiện quân (`caiThienQuan`) | Tăng tầm hoạt động, chiếm điểm then chốt |
| Bó quân (`boQuan`) | Ghim, cản chân Mã, phong tỏa Xe đối phương |
| Đổi quân (`doiQuan`) | Đơn giản hóa khi đang hơn, trừ khử quân công, phá phòng tuyến |
| Giữ tiên (`giuTien`) | Ép liên tục bằng chiếu hoặc dọa sát |
| Kỹ thuật tàn cuộc (`kyThuatTanCuoc`) | Đi đúng định thức tàn cuộc |

**Kể biến bằng lời:** ví dụ *"Sau P5-4, S4.5, X2.7, Đỏ dọa Xe xuống đáy chiếu bí, buộc Đen phải bỏ Mã."*

## Tầng 5: Hình sát và tàn cuộc lý thuyết (`patterns.ts`, `endgame.ts`)

**17 hình sát:** Trùng Pháo · Mã hậu Pháo · Thiết môn xuyên · Song Xe thác · Bạch kiểm tướng · Ngọa tào Mã · Điếu ngư Mã · Bát giác Mã · Cao điếu Mã · Quải giác Mã · Thiên địa Pháo · Giáp Xe Pháo · Hải để lao nguyệt · Muộn cung · Đại đao khu oa · Nhị quỷ phách môn · Song Mã ẩm tuyền.

**Tàn cuộc lý thuyết:** nhận diện các thế thắng hoặc hòa đã có kết luận trong sách, ví dụ:

- *Thắng:* Đơn Xe thắng Đơn Mã · Đơn Xe thắng Đơn Pháo · Đơn Xe thắng Song Sĩ (Khuyết Tượng) · Mã Chốt thắng Sĩ Tượng toàn · Pháo Chốt có ngòi thắng Sĩ Tượng toàn.
- *Hòa:* Đơn Xe hòa Sĩ Tượng toàn · Đơn Mã hòa Sĩ Tượng · Chốt đáy (Tốt già) hòa cờ · Cạn quân tấn công.

## Tầng 6: Giai đoạn và khai cuộc (`phases.ts`, `openings.ts`)

- **Giai đoạn:**
  - *Khai cuộc:* từ đầu ván đến khi rời sách khai cuộc hoặc đã ra đủ quân lớn, muộn nhất là nửa nước thứ 24.
  - *Tàn cuộc:* khi tổng số Xe Mã Pháo còn ≤ 5, hoặc thế cờ khớp một tàn cuộc lý thuyết.
  - *Trung cuộc:* giai đoạn nằm giữa hai mốc trên.
- **Khai cuộc:** tra cứu trong 20 nửa nước đầu (khoảng 10 hiệp). Hiển thị tên trận pháp, ý đồ của hai bên, và các nước tiếp theo theo sách.

## Bảng kết quả

1. Thanh lợi thế kèm WDL.
2. Top 3 nước, có mũi tên trên bàn cờ và chuỗi biến đi thử.
3. Cảnh báo đòn dọa, nếu có.
4. 3 lý do chính giải thích vì sao bên này hơn.
5. Nhãn mục đích của từng phương án.
6. Hình sát, tàn cuộc, giai đoạn và tên khai cuộc, nếu phát hiện được.

## Trường hợp biên

- **Đang bị chiếu:** không chạy null-move. Tầng 3 hiển thị "Đang bị chiếu".
- **Ván đã kết thúc (bí, hết nước):** không gọi engine, chỉ hiển thị kết quả ván.
- **Engine chưa cài, quá tải (503) hoặc lỗi:** vẫn hiển thị các tầng không cần engine (Tầng 2 phần tĩnh, Tầng 5, Tầng 6) và ghi rõ "Không có dữ liệu engine".
- **Tầng không có kết quả** (không có hình sát, đã ra khỏi khai cuộc): ẩn khối đó, không để trống.
