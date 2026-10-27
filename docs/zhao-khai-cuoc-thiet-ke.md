# Thiết Kế Chi Tiết Kỳ Lý Khai Cuộc Triệu Hâm Hâm (Giai đoạn C)

Tài liệu thiết kế cho các bài giảng khai cuộc `detectable` (gắn vào từng nước) và `evaluative` (ghi chú định thế), tuân thủ nghiêm ngặt kiến trúc 4 tầng và nguyên tắc không trùng lắp với 10 lỗi khai cuộc đã có.

---

## 1. Phân loại bài giảng và tích hợp vào hệ thống hiện có

Trong 48 bài giảng khai cuộc:
- **6 bài `summary`** (1, 2, 14, 15, 36, 48): Bài tổng kết, triết lý hoặc dị biến cạm bẫy không đo được -> Chỉ hiển thị trong danh mục bài học, không gắn vào nước đi.
- **6 bài trùng lặp với 10 lỗi khai cuộc hiện có** (`detectOpeningFault` trong `strategy.ts`):
  - **Bài 20**: Lỗi không ra Xe / bổ Sĩ sớm -> Tích hợp vào `lateRook`, `earlyAdvisor`, `advisorBlocksRook`.
  - **Bài 21**: Chính Mã -> Đối lập với `edgeHorse` (Mã biên).
  - **Bài 23**: Song Mã biên -> Tích hợp vào `doubleEdgeHorse`.
  - **Bài 31**: Pháo bất nghi khinh phát -> Tích hợp vào `earlyCannon`.
  - **Bài 46**: Phi Tượng loạn / Tượng biên -> Tích hợp vào `edgeElephant`.
  - **Bài 47**: Lên Sĩ sớm -> Tích hợp vào `earlyAdvisor`, `advisorBlocksRook`.
  👉 **Quy tắc tích hợp**: Không viết bộ nhận diện thứ hai. Fact `openingFault` được mở rộng thêm trường `lesson` tương ứng để liên kết tới bài giảng Triệu Hâm Hâm khi hiển thị.
- **9 bài `detectable` độc lập** được xây dựng bộ nhận diện 4 tầng trong `src/lib/xiangqi/opening-principles.ts`:
  1. Bài 11: Đại xuất Xe (`checkDaiXuatXe`) & Tránh tiến chốt biên làm ngòi cho Mã (`checkTienTotBienKhiXeChuaRa`)
  2. Bài 16: Tả Pháo phong Xe (`checkTaPhaoPhongXe`)
  3. Bài 17: Tránh dùng Pháo đổi Mã sớm (`checkPhaoDoiMaKhaiCuoc`)
  4. Bài 19: Tranh chiếm yếu đạo / Tránh lên Tướng sớm (`checkTranhChiemYeuDao`, `checkTuongKhongDong`)
  5. Bài 25: Cai Mã tam chùy (`checkCaiMaTamChuy`)
  6. Bài 27: Xe đè Mã quá hà / tuyến đáy (`checkXeDeMa`)
  7. Bài 28: Mã đơn độc tiến sâu (`checkMaDonDocTienSau`)
  8. Bài 41: Song Pháo quá hà phong tỏa (`checkSongPhaoQuaHa`)
  9. Bài 42: Lưỡng đầu xà (`checkLuongDauXa`) & Tướng không động
  10. Bài 45: Phi Tượng tấn chốt giữa (`checkPhiTuongTanTrungBinh`)
- **27 bài `evaluative`**: Nhận diện hình thế / trận hình khai cuộc (như Trực Xe, Hoành Xe, Sĩ giác Pháo, Quá cung Pháo, v.v.) kết hợp với `opening-shapes.ts`.

---

## 2. Thiết kế 4 tầng cho các bài `detectable` độc lập

### Bài 11: Thủ pháp xuất Xe — Đại xuất Xe (`checkDaiXuatXe`)
- **Bài giảng nói gì:** Xe 1 tấn 5 tiến thẳng đường biên công kích khi đối phương nhảy Mã biên (Quote `[01:16]`, `[03:25]`).
- **Trùng lặp:** Không trùng.
- **Tầng 1 (Hình):** Nước đi là Xe biên tiến thẳng lên tuyến hà / quá hà (ô biên hàng 4-5 của bàn cờ). Đối phương có Mã nhảy biên (ô (2,0), (2,8) của Đen hoặc (7,0), (7,8) của Đỏ).
- **Tầng 2 (Mục đích):** Nước đi không phải là chạy Xe khi bị Pháo/Mã dọa bắt trực tiếp; không phải ăn quân có sẵn.
- **Tầng 3 (Cơ chế PV):** Trên biến PV của engine, Xe biên này tiếp tục duy trì áp lực, khống chế hoặc dọa bắt Mã biên đối phương trong 2-4 nửa nước tiếp theo.
- **Tầng 4 (Kết quả):** `loss <= 30` (nước đi chuẩn xác không hớ điểm), điểm engine `>= -50`. Khen: "Đại xuất Xe: tiến Xe biên công phạt Mã biên đối phương".

---

### Bài 16: Tả Pháo phong Xe (`checkTaPhaoPhongXe`)
- **Bài giảng nói gì:** Dâng Pháo phong tỏa lộ xuất quân của Xe đối phương (Quote `[00:24]`, `[11:01]`).
- **Trùng lặp:** Không trùng với 10 lỗi (đây là kỳ lý khen hoặc ghi nhận chiến thuật).
- **Tầng 1 (Hình):** Nước đi dâng Pháo lên hàng tuần hà (hàng 3/6) hoặc hàng chốt đối phương (hàng 4/5) nằm trên cùng cột với Xe đối phương chưa xuất động (hoặc Xe đang ở góc).
- **Tầng 2 (Mục đích):** Không phải là Pháo chạy trốn vì bị dọa ăn, không phải nước ăn quân lớn.
- **Tầng 3 (Cơ chế PV):** Xe đối phương bị giảm số nước đi hợp lệ (mobility) từ >= 2 xuống <= 1 trong các nửa nước tiếp theo của PV.
- **Tầng 4 (Kết quả):** `loss <= 35`. Khen: "Tả Pháo phong Xe: dâng Pháo kiềm chế đường xuất động của Xe đối phương".

---

### Bài 17: Tránh dùng Pháo đổi Mã sớm (`checkPhaoDoiMaKhaiCuoc`)
- **Bài giảng nói gì:** Tuyệt đối không nên dùng Pháo đổi Mã sớm trong giai đoạn khai cuộc vì suy giảm hiệu suất và mất căn cứ phong tỏa (Quote `[02:13]`, `[19:33]`).
- **Trùng lặp:** Chưa có trong 10 lỗi.
- **Tầng 1 (Hình):** Giai đoạn khai cuộc (ply <= 16). Pháo ăn Mã đối phương khi chưa có sự phối hợp của Xe/quân lớn khác tạo đòn sát.
- **Tầng 2 (Mục đích):** Nước đi không phải là lấy lại quân bị mất (không phải đòn hoàn vốn), Pháo không đang bị bắt không lối thoát.
- **Tầng 3 (Cơ chế PV):** Biến PV không dẫn đến ưu thế thắng quân hoặc chiếu bí; đối phương ăn lại Pháo và mở thông đường cho Xe/Tượng.
- **Tầng 4 (Kết quả):** `loss >= 40` hoặc nước bị đánh giá là lỗi (`isFault = true`). Chê: "Pháo đổi Mã sớm: hao tổn quân lực chủ lực và nhường thế chủ động cho đối phương".

---

### Bài 19: Tranh chiếm yếu đạo / Tránh dâng Tướng sớm (`checkTranhChiemYeuDao`, `checkTuongKhaiCuoc`)
- **Bài giảng nói gì:** "Giai đoạn khai cuộc nếu chủ động lên tướng kiểu như thế này đều bị cho là hành vi không biết chơi cờ" (Quote `[16:19]`).
- **Trùng lặp:** Chưa có lỗi Tướng cử động sớm trong 10 lỗi khai cuộc.
- **Tầng 1 (Hình):** Ply <= 16. Nước đi di chuyển Tướng rời khỏi ô ban đầu (Tướng lên hoặc Tướng bình).
- **Tầng 2 (Mục đích):** Thế cờ trước nước đi KHÔNG bị chiếu (không phải nước bắt buộc đỡ chiếu).
- **Tầng 3 (Cơ chế PV):** Nước đi làm mất nhịp ra quân chủ lực, tạo điều kiện cho đối phương tập kích trung lộ.
- **Tầng 4 (Kết quả):** `loss >= 50` hoặc `isFault`. Chê: "Dâng Tướng sớm: đại kỵ khai cuộc làm chậm nhịp xuất quân và để lộ sơ hở trung tâm".

---

### Bài 25: Cai Mã tam chùy (`checkCaiMaTamChuy`)
- **Bài giảng nói gì:** Thí chốt dụ Tượng bay cao rồi tung Mã biên lao lên tấn công liên hoàn tam trùy (Quote `[03:50]`, `[16:32]`).
- **Trùng lặp:** Không trùng.
- **Tầng 1 (Hình):** Thí chốt 3 hoặc chốt 7 (hoặc chốt biên) kích động Tượng đối phương bay lên, kế đó Mã nhảy lên vị trí biên/hà khẩu.
- **Tầng 2 (Mục đích):** Nước đi chủ động thí quân mở đường công kích cánh Tượng hở.
- **Tầng 3 (Cơ chế PV):** Trong PV, Tượng đối phương bị thu hút rời vị trí, Mã phe đi thâm nhập đe dọa các điểm yếu ở cánh đối phương.
- **Tầng 4 (Kết quả):** `loss <= 30`, điểm eval duy trì tốt. Khen: "Cai Mã tam chùy: thủ pháp thí chốt dụ Tượng dâng cao để Mã xuất kích công phá".

---

### Bài 27: Xe đè Mã quá hà / tuyến đáy (`checkXeDeMa`)
- **Bài giảng nói gì:** Xe là chủ lực tuyệt đối trong việc công Mã; đè Mã quá hà hoặc đè Mã tuyến đáy triệt tiêu sức bật của địch (Quote `[01:16]`, `[24:03]`).
- **Trùng lặp:** `strategy.ts` có chỉ số `phongToa`, nhưng chưa có kỳ lý cụ thể phân tích Xe đè Mã.
- **Tầng 1 (Hình):** Xe di chuyển đến ô cùng cột hoặc cùng hàng đè chặt Mã đối phương (ô Mã đứng bị Xe kiểm soát hoặc chặn chân trực tiếp).
- **Tầng 2 (Mục đích):** Nước đi chủ động đè ép, không phải Xe chạy trốn.
- **Tầng 3 (Cơ chế PV):** Mã đối phương có số nước đi hợp lệ bằng 0 trong 2 nửa nước tiếp theo của PV, hoặc buộc phải lùi về chịu thiệt.
- **Tầng 4 (Kết quả):** `loss <= 25`. Khen: "Xe đè Mã: khóa chặt sức cơ động của Mã đối phương, mở rộng ưu thế tiên thủ".

---

### Bài 28: Mã đơn độc tiến sâu (`checkMaDonDocTienSau`)
- **Bài giảng nói gì:** "Để con mã này đơn độc tiến sâu vào lòng địch, kết quả bị đối phương vây bắt. Tình huống này là điều đại kỵ trong khai cuộc." (Quote `[26:15]`).
- **Trùng lặp:** Chưa có trong 10 lỗi.
- **Tầng 1 (Hình):** Ply <= 18. Mã nhảy qua sông tiến sâu vào hàng chốt hoặc hàng đáy đối phương, trong khi các quân lớn khác (Xe, Pháo) chưa kịp qua sông chi viện.
- **Tầng 2 (Mục đích):** Nước đi không tạo ra đòn sát ngay lập tức.
- **Tầng 3 (Cơ chế PV):** Trong 2-4 nửa nước PV tiếp theo, Mã bị Xe, Pháo hoặc Tướng Sĩ đối phương vây bọc, mất đường rút lui hoặc bị bắt chết.
- **Tầng 4 (Kết quả):** `loss >= 60` hoặc `isFault`. Chê: "Mã đơn độc tiến sâu: đại kỵ khai cuộc, Mã đơn độc vượt tuyến bị đối phương vây bắt".

---

### Bài 41: Song Pháo quá hà phong tỏa (`checkSongPhaoQuaHa`)
- **Bài giảng nói gì:** Hai Pháo cùng qua sông tạo thế phong tỏa ngột ngạt nhưng mang rủi ro lớn (Quote `[01:55]`, `[19:22]`).
- **Trùng lặp:** Liên quan `earlyCannon`, nhưng đây là thế trận phối hợp hai Pháo quá hà.
- **Tầng 1 (Hình):** Cả hai Pháo cùng ở phía bên kia sông trong 16 nửa nước đầu.
- **Tầng 2 (Mục đích):** Tạo gọng kìm phong tỏa hàng chốt và sườn đối phương.
- **Tầng 3 (Cơ chế PV):** Nếu giữ được trận thế không bị Xe địch đuổi bắt -> Khen; nếu bị Xe đối phương truy đuổi mất tiên -> Nhắc nhở rủi ro.
- **Tầng 4 (Kết quả):** Phân loại Khen (`loss <= 30`) hoặc Cảnh báo (`loss > 50`).

---

### Bài 45: Phi Tượng tấn chốt giữa (`checkPhiTuongTanTrungBinh`)
- **Bài giảng nói gì:** Phi Tượng mà tiến chốt giữa chỉ nên đi khi mục đích rõ ràng: đưa Mã lên vai Tượng đắc địa hoặc thông Xe hàng chốt (Quote `[02:10]`, `[08:54]`, `[20:51]`).
- **Trùng lặp:** Không trùng.
- **Tầng 1 (Hình):** Trận hình đã bay chính Tượng (Tượng 3/7 lên 5). Nước đi là thúc trung binh (B5+1).
- **Tầng 2 (Mục đích):** Mở đường cho Mã chiếm vai Tượng (ô (6,4) / (3,4)) hoặc mở thông lộ cho Xe.
- **Tầng 3 (Cơ chế PV):** Trong PV, Mã nhanh chóng tiến lên vai Tượng hoặc Xe kiểm soát hàng chốt.
- **Tầng 4 (Kết quả):** `loss <= 30`. Khen: "Phi Tượng tấn trung binh: chủ động thông lộ mở đường cho Mã lên vai Tượng đắc địa".

---

## 3. Quyết định về Nước Sách Khai Cuộc (`isBookMove`)

- **Vấn đề:** Trong 16 nửa nước đầu, nước sách được gắn `cls = "book"`. Hiện tại `keepZhaoFact` tự động loại bỏ mọi kỳ lý Triệu Hâm Hâm nếu `isBookMove` đúng.
- **Giải pháp:**
  1. Giữ nguyên phân loại `cls = "book"` cho engine để không làm xáo trộn điểm số và phân tích ván đấu.
  2. Với các nước sách kinh điển trùng khớp với kỳ lý bài giảng (như Tả Pháo phong Xe, Lưỡng đầu xà, v.v.): Cho phép `keepOpeningFact` giữ lại fact `zhaoOpening` đi kèm, hiển thị huy hiệu: **"Nước theo sách · Hợp kỳ lý Triệu Hâm Hâm"**.
  3. Lời bình sẽ trích dẫn ngắn gọn nguyên lý của thầy Triệu Hâm Hâm để người dùng hiểu *tại sao* nước sách đó lại được các đại sư lựa chọn.
