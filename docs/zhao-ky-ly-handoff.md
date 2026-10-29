# Bàn giao: kỳ lý Triệu Hâm Hâm — phần còn lại

Tài liệu cho AI / người làm tiếp phần "phân tích theo nguyên lý" (48 bài trung cuộc + 48 bài tàn cuộc của Triệu Hâm Hâm).
Trả lời người dùng bằng tiếng Việt. Đọc hết mục 1–3 trước khi sửa code.

## 1. Vì sao phải làm lại

Bản đầu, bộ nhận diện chỉ nhìn **hình** (quân đứng ở đâu) rồi gắn kỳ lý kèm câu khuôn thổi phồng
("đưa Tướng vào thế hiểm nghèo" khi engine chấm −14, "tất thắng" khi hơn một Tốt). Tàn cuộc từng gắn kỳ lý cho 81% số nước.
Người dùng đã chỉ cách làm đúng qua bài **Pháo trầm đáy** (`checkDeepCannonBottom` trong
[zhao-principles.ts](../src/lib/xiangqi/zhao-principles.ts)): mỗi kỳ lý phải qua **4 tầng**, và lời bình kể lại đúng chuyện
xảy ra trong biến engine.

| Tầng | Câu hỏi | Trượt khi |
|---|---|---|
| 1. Hình | Thế cờ có đúng hình bài giảng mô tả không? | Không đúng hình → không phải ứng viên |
| 2. Mục đích | Nước này có phải vì kỳ lý đó, hay vì việc khác? | Nước tự ăn quân lớn (mục đích là ăn quân), chạy quân đang bị dọa… |
| 3. Cơ chế | Trong biến engine, **chính các quân làm nên hình** có ra tay và tạo ra điều bài giảng nói không? | Đòn đến từ quân khác, biến không sát / không thắng quân, quân bị ăn mất không bù ("biếu không") |
| 4. Kết quả | Nước đi có tốt thật không? | Hớ so với nước tốt nhất (`soundMove`), engine chấm bên đi < +200 (hoặc +150 với Pháo trầm đáy) |

Nguyên tắc: **không kiểm chứng được bằng biến engine thì không gắn**. Thà im còn hơn khen sai.

## 2. Trạng thái hiện tại (2026-10-24)

- **Tàn cuộc: xong**, đã commit (`abe7a23`). 28 bài gắn theo từng nước (đều kiểm biến engine), 12 bài "đánh giá"
  chỉ ghi chú một lần khi vào thế quân đó, 8 bài tổng kết không gắn. Phân loại nằm ở trường `kind` trong
  [zhao48-endgame-lessons.ts](../src/lib/xiangqi/zhao48-endgame-lessons.ts). Tỉ lệ gắn: 81,2% → 7,3%.
- **Trung cuộc: đã commit (`866aa77`)**, và đã **hoàn tất toàn bộ 11/11 bài trung cuộc còn lại sang 4 tầng**:
  - Bài 2: Muộn cung sát (`checkSmotheredCannonMate`).
  - Bài 4: Ngọa tâm Mã (`checkOaTamKnight`).
  - Bài 5: Chuyển hóa tàn cuộc (`checkEndgameConversion`).
  - Bài 6: Chặn đường (`checkInterference`).
  - Bài 8: Binh quý thần tốc (`checkMatingRace`).
  - Bài 10: Nhất Mã hoán lưỡng Tượng (`checkNhatMaHoanLuongTuong`).
  - Bài 11: Đoạt trung binh (`checkDoatTrungBinh`).
  - Bài 40 / 41: Một Xe đổi hai / ba (`checkMotXeDoiHai`, `checkMotXeDoiBa`).
  - Bài 46: Phế Tốt phản công (`checkPheTotPhanCong`).
  - Bài 47: Mưu binh (`checkChienThuatMuuBinh`).
  - Toàn bộ test suite 4 tầng đạt 248/248 tests passed và `typecheck` sạch 100%.

## 3. Kiến trúc cần biết

Luồng: `reviewMove` ([analysis.ts](../src/lib/xiangqi/analysis.ts)) → `detectAllZhaoTactics` → các `detectXxx` → `keepZhaoFact`
lọc tiếp bằng `zhaoOutcomeAllows` ([zhao-outcome.ts](../src/lib/xiangqi/zhao-outcome.ts)).
**Kỳ lý không có trong bảng `RULES` của zhao-outcome.ts thì không bao giờ được gắn** — đây là cách 12 bài thế trận đang bị tắt.

Hàm dùng chung trong [engine-line.ts](../src/lib/xiangqi/engine-line.ts) (thuần hàm, không gọi engine):

| Hàm | Dùng để |
|---|---|
| `engineLine(before, move, options)` | Đi thử nước + PV trên bàn, trả `EngineLine` (mỗi nửa nước có `origin` = ô ban đầu của quân → theo dõi danh tính quân qua biến), `outcome`, `scoreForMover`, `moverMates` |
| `decisiveBlow(line, fromPly)` | Đòn quyết định: sát hoặc lần thắng quân, kèm `end` (nửa nước) và lời kể kết quả |
| `pieceRole(line, origin, upTo)` | Quân xuất phát từ ô `origin` đã chiếu bao nhiêu lần, ăn những gì (tính cả chiếu lộ diện / chiếu kép cho đúng quân chiếu) |
| `narrate(line, upTo)` | Kể biến thành lời ("Xe ăn Sĩ chiếu (…), Đen Tướng tránh chiếu (…) …") |
| `tally(line, ply)`, `mateEnd`, `mateText`, `moverCaptureAt` | Đếm vật chất, tìm nước sát, tìm nước ăn quân |

Trong zhao-principles.ts:

- `checkAttackLine(before, move, options, keys, need)` — tầng 2–4 cho kỳ lý tấn công. `keys` = ô (trong thế **trước** nước đi)
  của các quân làm nên hình; cần ít nhất `need` quân trong đó chiếu hoặc ăn quân trước / tại đòn quyết định. Quân vừa đi thì
  truyền `move.from`, không phải `move.to`.
- `captureStory(before, move, options, target)` — kỳ lý vây bắt: biến phải bắt được **đúng con** ở ô `target` trong 10 nửa nước.
- `fact(before, move, tactic, summary, details)` — tạo fact. Lời bình dạng `"<Tên>: <hình> (<nước>); theo biến: <r.summary>."`;
  `fact` tự tách đoạn sau `"theo biến: "` vào trường `line` để hai kỳ lý cùng kể một biến thì chỉ kể một lần.

## 4. Việc còn lại

### 4.1. Đưa các bài trung cuộc còn lại sang 4 tầng (ưu tiên cao)

Các bài này mới chỉ qua luật kết quả chung trong `RULES` (biến sát / thắng quân / phế được bù), **chưa kiểm đúng quân làm nên hình
có ra tay**. Làm từng bài: đọc thẻ bài trong [zhao48-lessons.ts](../src/lib/xiangqi/zhao48-lessons.ts) (`principle`, `signals`,
`quotes`) để biết bài giảng nói cơ chế là gì, rồi viết tầng 3 cho đúng cơ chế đó. Gợi ý dưới đây là điểm xuất phát, không phải đáp án.

| Bài | tacticId | Bộ nhận diện | Trạng thái / Gợi ý tầng 3 |
|---|---|---|---|
| 2 Muộn cung | `muonCungSat` | `detectSmotheredCannonMate` | **Xong** (`checkSmotheredCannonMate`: Pháo chiếu, Tướng bị chính quân nhà chèn kẹt ở thế cuối) |
| 4 Ngọa tâm Mã (chê) | `oaTamMa` | `detectOaTamKnight` | **Xong** (`checkOaTamKnight`: Mã thoái hoa tim, bên đi bị sát/mất quân do Mã cản Tướng/bị bắt) |
| 5 Chuyển hóa tàn cuộc | `chuyenHoaTanCuoc` | `detectEndgameConversion` | **Xong** (`checkEndgameConversion`: hơn vật chất, đổi ngang quân lớn về tàn cuộc `majorsLeft <= 6`, hết đòn ép; kể biến bằng `narrate`) |
| 6 Chặn đường | `chanDuong` | `detectInterference` | **Xong** (`checkInterference`: chen vào tuyến giao liên, bắt đúng quân bị cắt căn qua `captureStory` hoặc chiếu bí) |
| 8 Binh quý thần tốc | `tranhNuoc` | `detectMatingRace` | **Xong** (`checkMatingRace`: đối phương dọa sát, chiếu trước giành nước và biến engine sát trước hoặc bẻ gãy đòn sát) |
| 10 Nhất Mã hoán lưỡng Tượng | `nhatMaHoanLuongTuong` | `detectNhatMaHoanLuongTuong` | **Xong** (`checkNhatMaHoanLuongTuong`: đúng Mã vừa đi bị mất qua `origin`, ăn đủ 2 Tượng trong biến) |
| 11 Đoạt trung binh | `doatTrungBinh` | `detectDoatTrungBinh` | **Xong** (`checkDoatTrungBinh`: ăn sạch Tốt đầu, giữ được Tốt và vật chất trong biến) |
| 40 / 41 Một Xe đổi hai / ba | `motXeDoiHai` / `motXeDoiBa` | `detectMotXeDoiHai` / `detectMotXeDoiBa` | **Xong** (`checkMotXeDoiHai`, `checkMotXeDoiBa`: đúng Xe vừa đi bị mất qua `origin`; ăn đủ 2 quân nhẹ hoặc 3 quân; kể biến bằng `narrate`) |
| 46 Phế Tốt phản công | `pheTotPhanCong` | `detectPheTotPhanCong` | **Xong** (`checkPheTotPhanCong`: đúng Tốt vừa đi bị ăn qua `origin`; quân khác phản công có đòn quyết định `decisiveBlow`; kể biến bằng `narrate`) |
| 47 Mưu binh | `chienThuatMuuBinh` | `detectChienThuatMuuBinh` | **Xong** (`checkChienThuatMuuBinh`: ăn sạch Tốt vỏ bọc chưa qua sông không mất căn, giữ vững ưu thế vật chất trong biến; kể biến bằng `narrate`) |

Với mỗi bài: viết `checkXxx(...): PrincipleCheck | null` (trả cả tầng trượt và lý do như `checkDeepCannonBottom`) để test được
từng tầng; `detectXxx` chỉ gọi nó rồi dựng `fact`. Viết lại lời bình theo khuôn ở mục 3, bỏ hết câu khuôn thổi phồng.

### 4.2. 12 bài thế trận (đã xử lý 2026-10-27, người dùng duyệt cơ chế)

Tầng 4 chung: không hớ (`soundMove`), engine chấm bên đi từ +100. Bài cần hình còn giữ thì biến phải dài ít nhất `HOLD_PLIES` (6) nửa nước.
Số trong ngoặc là số nước được gắn trên 203 ván (cache 30k nodes).

| Bài | Hàm | Cơ chế tầng 3 |
|---|---|---|
| 9 Máy ủi trung lộ | `checkMayUiTrungLo` | `checkAttackLine` với nhóm Tốt giữa + Pháo đầu + Xe/Mã cột 3–5, cần ≥ 2 quân ra tay (0) |
| 19 Chiếm tuyến Tốt | `checkChiemTuyenTot` | một trong: Xe ăn Tốt không bị bắt · ô nhảy **an toàn** của Mã đối phương giảm ≥ 2 · Mã nhà vào ngọa tào (1) |
| 23 Tốt biên đại náo | `checkTotBienDaiNao` | `checkAttackLine` với chính con Tốt biên (0) |
| 42 Hồi Mã kim thương | `checkMaVanNhuLong` | Mã thoái, không phải chạy Mã bị dọa; `checkAttackLine` với chính con Mã (2) |
| 18 Kiềm chế đỉnh cung | `checkKiemCheDinhCung` | ô đi an toàn của Mã+Pháo đối phương giảm ≥ 30% (≥ 3 ô), quân khóa đứng trên hàng suốt biến, cuối biến chưa gỡ (0) |
| 20 Kỵ hà xa | `checkKhongCheKyHa` | Xe đứng trên tuyến kỵ hà suốt biến, đối phương không đưa thêm quân qua sông (0) |
| 22 Phong tỏa lộ Xe | `checkPhongToaLoXe` | phong tỏa: Xe đối phương ở góc suốt biến ≤ 2 ô đi · phản phong tỏa: phải có Pháo/Mã đối phương trên lộ 2/8, Xe nhà cuối biến ≥ 5 ô đi (1) |
| 38 / 39 Xe Song Mã đối Xe Song Pháo | `checkXeMaDoiXePhao` | `kind: "evaluative"`, tone `"note"`: ghi chú một lần khi vào cấu hình, dẫn bài của bên engine chấm hơn ≥ 100; cân bằng thì im (1 + 1) |
| 7, 26, 27 | — | **Để tắt**, lý do ghi trong comment ở `RULES` (zhao-outcome.ts) |

Cạm bẫy mới: đếm "số nước đi được" của quân đối phương bằng nước hợp lệ sẽ sai khi đối phương đang bị chiếu (quân nào cũng
"kẹt") — dùng ô đi an toàn (`safeMoves`). Phản phong tỏa mà chỉ có quân nhà chắn Xe rồi tự tránh đi là xuất Xe thường.

### 4.3. Bài không gắn lần nào trên 203 ván (audit phễu 2026-10-27)

`data/kypho/loi-binh.jsonl` không có trên máy nên `audit-zhao-corpus.ts` không chạy được; thay bằng phễu trên 203 ván (cache 30k):
gọi thẳng bộ nhận diện với biến engine → luật kết quả (`RULES`) → lọc khen/chê + "nước đáng bình" → ưu tiên / bỏ lặp.

| Bài | Bộ nhận diện khớp | Rớt ở đâu, kết luận |
|---|---|---|
| 4 Oa tâm Mã (chê) | 1 | nước của đại sư loss 0 → không chê là đúng |
| 12 Không tâm pháo | 1 | nước tự ăn Tốt (attackPaysOff loại); biến thực ra là Xe mở tuyến, không phải không tâm pháo — đúng |
| 15 Pháo đáy khóa Xe | 0 (cả theo ván) | kỳ phổ không có hình — đúng |
| 25 Song Xe | 6 | 2 nước bị **Mạnh công tuyến áp đáy** (ưu tiên cao hơn, cùng biến) chiếm → **đã sửa thứ tự** |
| 30 Xe Song Pháo | 3 | 1 nước bị Mạnh công chiếm (đã sửa); 2 nước lặng rớt ở "đáng bình" |
| 31 Xe Mã lãnh chiêu | 1 | **lỗi**: bộ nhận diện bắt ăn Sĩ, attackPaysOff loại mọi nước tự ăn quân → không bao giờ gắn. Đã thay luật: sát hoặc `materialSettled ≥ 600` (Sĩ + một quân nhẹ). Ca duy nhất chỉ +300 nên vẫn 0 |
| 33 Phế quân phá Sĩ Tượng | 140 | hình rộng, RULES (`realSacrifice`) lọc gần hết: đa số là ăn Sĩ/Tượng rồi đổi quân — đúng |
| 34 Vây Xe | 11 | cả 11 biến là Xe đổi Xe (Xe "bị vây" tự đổi ra) — đúng |
| 37 Vây Mã giác | 7 | 5 đổi Mã ngang — đúng; 1 nước lặng thắng Mã rớt ở "đáng bình" |

Thứ tự `PRIORITY` mới: Oanh tạc lộ sườn → Song Xe → Xe Mã Pháo tam tử → Xe Song Pháo → Xe Song Mã → Mạnh công tuyến áp đáy
(tổ hợp nhiều quân cụ thể hơn "một quân vào hàng 2"; Oanh tạc đứng đầu để bài 16 giữ thế 8636 #36).

**Nước lặng**: modal trước đây bỏ `lines` (MultiPV) của `/api/engine` nên `reviewMove` không bao giờ chấm ra nước duy nhất / nước hay,
khác màn phân tích ván (batch route có MultiPV). Đã cho modal giữ `lines` + `wdl`; builder bước 2 làm y hệt, bước 1 gom thêm nước
lặng có kỳ lý khen đã qua `RULES` (xếp sau ứng viên thường).

Kết quả sinh lại sau khi mở rộng thêm 32 ván đại sư vào MASTER_GAMES (tổng 235 ván, `--per-lesson 3`): 109 → 151 thế.
- Thêm **Bài 2 Muộn cung sát** (8361 #62): sửa `afterEval` cho nước chiếu bí trong modal và builder.
- Thêm **Bài 10 Nhất Mã hoán Lưỡng Tượng** (1087 #35, 1642 #58): Mã ăn Tượng thật sự trong ván đấu.
- Thêm **Bài 20 Kỵ hà xa** (7747 #32): Xe tuần hà khống chế bờ sông.
- Bổ sung nhiều thế cờ 2–3 thế/bài cho các bài trung cuộc và tàn cuộc.
- 16 thế cũ bị thay (bài TC 5, 21, 42, 46; TàC 5, 7, 14, 16, 21, 27, 32) chỉ vì ván mới chen vào trước trong thứ tự ứng viên và
  chiếm suất 3 thế/bài — không bài nào mất hẳn thế.
- Đã đọc lời bình 58 thế mới. Sửa: "Phế Tốt phản công" từng nhận nước Tốt ăn Pháo (1642 #21) — giờ loại mọi nước Tốt tự ăn quân
  (test thế thật). Nước kết thúc ván: chỉ coi là sát khi bên đi thắng, hòa thì chấm 0 (modal + builder).
- Siết thêm hai luật tàn cuộc (test thế thật): "Đổi về tàn cuộc thắng" đòi engine chấm ≥ +200 khi có điểm (8080 #137 bảng xếp
  Đơn Xe thắng Đơn Pháo nhưng Pikafish chỉ +36); "Tướng trợ công" đòi bên đi còn Xe/Mã/Pháo/Tốt (2937 #179 chỉ còn Song Tượng
  giữ hòa). Sinh lại: 150 thế; tàn cuộc bài 2 thành trống, bài 16 lấy lại 3191 #50.
- Cố ý giữ: TC 40 và 41 cùng gắn thế 162 #100 (Xe đổi Mã Pháo Tốt) — test cũ ("Lỗi 7" và thế chuẩn bài 41) chốt rằng cuộc đổi
  này thuộc cả hai bài.
- Trung cuộc còn trống: 4, 7, 9, 12, 15, 18, 23, 26, 27, 31, 33, 34, 37 (trong đó 7, 26, 27 để tắt).
- Tàn cuộc còn trống: 2, 3, 17, 19, 29, 33, 34, 36, 39, 40, 41.

### 4.4. Bài 24 — Đặt đúng quân vào đúng vị trí (phương hướng, 2026-10-29)

Trước đây là thẻ `summary` (không gắn). Nay là `evaluative`, tactic `datDungViTri`, code ở
[direction.ts](../src/lib/xiangqi/direction.ts), test ở [direction.test.ts](../src/lib/xiangqi/direction.test.ts).
Ý bài: không có vị trí đúng tuyệt đối, chỉ đúng so với mục tiêu giai đoạn. Ở đây **chiến trường** (trung lộ / cánh lộ 1–3 /
cánh lộ 7–9) đọc từ biến tốt nhất của engine: nơi quân bên đi dồn tới (nước sớm nặng hơn) cộng quân đã qua sông.
Chỉ xét trung cuộc (≥ 6 Xe/Mã/Pháo trên bàn) và nước lặng của Xe/Mã/Pháo.

| Bộ kiểm | Tầng 1 hình | Tầng 2 mục đích | Tầng 3 cơ chế | Tầng 4 kết quả |
|---|---|---|---|---|
| `checkLechHuong` (chê) | quân rời xa chiến trường; nước tốt nhất đặt **quân lớn** vào chiến trường | quân không bị dọa | cùng độ sâu, biến tốt nhất khống chế chiến trường hơn ≥ 3 ô; đối phương đưa quân vào đó; đối phương **không** phạt bằng ăn quân lớn (thì là lỗi chiến thuật) | loss ≥ 50 |
| `checkDatDungViTri` (khen) | chính nước tốt nhất; vào chiến trường từ ngoài, hoặc làm căn cho Xe/Mã/Pháo đang không căn | quân không bị dọa | quân trụ 6 nửa nước; quân được làm căn không bị ăn; vào chiến trường thì khống chế hơn biến của nước thứ hai ≥ 2 ô | không hớ, hơn nước thứ hai (MultiPV) ≥ 40, bên đi không thua rõ |

Lời khen bỏ qua `isSignificantMove` (analysis.ts) vì chính bài này khen nước lặng; tiêu chí "đáng bình" của nó là hơn rõ nước thứ hai.
Luật trong `RULES`: không `losesMaterial`, `materialSettled ≥ -50`.

Audit phễu `checkLechHuong` trên 240 ván (cache 30k, 18.726 nước có điểm): 10 nước gắn (≈ 0,4% số nước thiệt ≥ 50).
Rớt nhiều nhất ở tầng 1 (quân không rời chiến trường 2.820; biến không có hướng rõ 864). Bộ khen chưa audit được trên kỳ phổ
vì cache không có MultiPV.

Còn lại: thế chuẩn của 3 ví dụ trong bài (Vương Gia Lương – Dương Quang Lân: Xe 4 bình 1 / Xe 4 thoái 2; thế "Tiên nhân chỉ lộ":
Pháo 2 bình 9; Hồ Vinh Hoa – Vương Gia Lương 1965) — chờ người dùng gửi FEN để làm test chuẩn và benchmark.

## 5. Cách làm và kiểm

**Test** ([zhao-principles.test.ts](../src/lib/xiangqi/zhao-principles.test.ts), xem khối "Pháo Trầm Đáy" làm mẫu):

- Dùng **thế cờ thật** từ ván đại sư kèm PV Pikafish 30k nodes, không dựng thế đồ chơi. PV lấy từ
  `.data/audit-cache/master-all-30000.json` (khóa là FEN; `pv` là UCI, đổi bằng `uciToMove`) sau khi chạy audit.
- Ô = `hàng * 9 + cột`, hàng 0 là hàng đáy của Đen. `options.evalAfter.score` tính theo **bên đối phương** (= −điểm bên đi);
  `options.pv` là biến của thế sau, bắt đầu bằng nước đáp.
- Mỗi kỳ lý cần ít nhất: 1 ca `ok: true` (kiểm cả `mechanism` và nội dung lời bình), và mỗi tầng có 1 ca trượt đúng tầng
  (`toMatchObject({ ok: false, layer: N })`), cộng ca "chỉ có hình, không có biến engine thì không gắn".
- Test phải khẳng định luật cờ thật, không viết cho vừa code. Test lộ ra lỗi thì sửa code, báo người dùng, không nới assertion.
- Máy người dùng yếu (8 CPU / 16 GB): chỉ chạy file liên quan, vd.
  `npx vitest run --project unit src/lib/xiangqi/zhao-principles.test.ts src/lib/xiangqi/middlegame.test.ts`.
  Chạy `npm run typecheck` trước khi báo xong.

**Đo trên ván thật** sau mỗi đợt (cần Pikafish qua `getEnginePool`; có cache thì chạy lại nhanh):

- `npx tsx scripts/audit-zhao-lessons.ts [--only khongTamPhao,vayXe]` — chạy đúng `reviewGame` của app trên 203 ván đại sư,
  đếm từng kỳ lý được gắn và in mẫu. **Đọc mẫu bằng mắt**: lời bình có khớp biến không, có khen bên thua không.
- `npx tsx scripts/audit-zhao-corpus.ts --only <nhóm>` — độ phủ so với lời bình chuyên gia (từ khóa tiếng Trung).
- Tàn cuộc: `audit-endgame-principles.ts`, `audit-endgame-corpus.ts`.
- Ghi lại số trước / sau (tỉ lệ nước được gắn, số nước mỗi kỳ lý) để báo người dùng.

## 6. Cạm bẫy đã gặp

- Ở 30k nodes, thế quyết định hay trả PV chỉ 1 nước → kỳ lý dựa trên PV sẽ im. Đừng hạ ngưỡng chỉ vì lý do này.
- Pikafish có thể treo ở thế rất ít quân dựng tay (vd. Tướng + Pháo + Tốt đấu Tướng ở 200k nodes) — thêm lý do dùng thế thật.
- Đưa thế giữa ván vào `reviewMove` như ván 1 nước thì truyền `playedNotationsOverride` (vd. `["—"]`), không thì nước bị coi là
  nước khai cuộc theo sách và không có kỳ lý.
- Kỳ lý bẫy / vây bắt phải loại nước chiếu (quân "không đi được" chỉ vì đang bị chiếu) và nước tự ăn quân lớn.
- "Khí tử tranh tiên" phải loại ăn lại ngay (đó là đổi quân).
- Ở tàn cuộc ít quân, gần như nước chiếu nào cũng chỉ còn ≤ 2 nước đỡ — đỡ chiếu là chuyện thường, không phải kỹ thuật.
- Thư mục `.data/expert-commentary` hiện đã có trên máy; các ván có bình luận chuyên gia này có thể tận dụng làm kho thứ ba sau khi hoàn thành xqbase.
- Muốn có số "trước" mà không đụng cây làm việc: `git worktree` + junction tới `node_modules`, `engine`, `.data`; gỡ junction bằng
  `rmdir` trước khi `git worktree remove`.

## 7. Kế hoạch tiếp: mở rộng nguồn ván cho các bài trung cuộc còn trống

Viết 2026-10-27 cho AI làm tiếp. Mục tiêu: các bài trung cuộc chưa có thế đối chiếu (2, 4, 9, 10, 12, 15, 18, 20, 23, 31, 33,
34, 37) có thế **thật** trong ván đại sư, được engine xác nhận như modal chấm. Bài 7, 26, 27 để tắt (mục 4.2), không làm.

**Không làm**: nới bộ nhận diện / `RULES` cho bài hiện ra. Phễu ở mục 4.3 cho thấy các bài này trống vì 203 ván không có thế đúng
đòn (vd. 11 ca "Vây Xe" đều là Xe đổi Xe). Chỉ nới khi đọc được một nước bị bỏ sót là đòn thật — và thêm chính thế đó vào test.

### Bước 0 — Hỏi người dùng trước khi bắt đầu (quyết định của họ)

1. **Ván mới để ở đâu.** `master-games.generated.ts` (636K, 203 ván) được app dùng cho trang `/masters` và `/masters/[id]`;
   test `zhao-benchmark-data.test.ts` đòi ván của mỗi thế đối chiếu phải nằm trong `MASTER_GAMES`. Đề xuất:
   kho tìm kiếm riêng **không ship** (`.data/master-games-extra/`), builder quét cả hai kho, và **chỉ ván có thế được giữ**
   mới thêm vào `.data/master-games/` (→ `MASTER_GAMES`). Như vậy trang `/masters` chỉ thêm vài chục ván, không phình bundle.
2. **Bao nhiêu ván.** Đề xuất thử 300 ván trước, đo tỉ lệ ra thế mới, rồi mới lấy tới ~1000.
   Chi phí (máy 8 CPU / 16 GB): tải 2 s/ván; chấm ~100 thế/ván ở 30k nodes, 2 luồng.

### Bước 1 — Tải ván vào kho riêng

- `scripts/fetch-master-games.py` ghi cứng `OUTPUT_DIR = .data/master-games` và chọn `gameid` cách đều trên 1..11150
  (`step = 11150 // count`). Thêm tham số `--out <dir>` (mặc định giữ như cũ) và `--offset k` để lệch lưới khỏi 203 id đã có;
  hoặc `--resume` kèm loại id đã có ở cả hai thư mục.
- Chạy nền: `python3 scripts/fetch-master-games.py --count 300 --out .data/master-games-extra --resume`. Giữ `--delay 2`.
- `.data/` không commit. Không sửa `generate-master-games-data.ts` ở bước này.

### Bước 2 — Builder và audit đọc được kho riêng

- `scripts/build-zhao-benchmark.ts` và `scripts/audit-zhao-lessons.ts` hiện lấy ván từ `MASTER_GAMES`. Thêm tham số
  `--extra .data/master-games-extra`: đọc `game_*.json`, đổi `moves_chinese` bằng `convertChineseGame` (bỏ ván `!success` hoặc
  < 6 nước, như `generate-master-games-data.ts`), gộp vào danh sách ván (id không trùng). Metadata (`red`, `black`, …) lấy từ file.
- Cache engine dùng chung `.data/audit-cache/master-all-30000.json` (khóa FEN) — ván mới chỉ chấm phần thiếu. Lưu cache định kỳ
  (audit-zhao-lessons đã `save()` mỗi 500 thế; builder hiện chỉ ghi một lần cuối — thêm lưu định kỳ để không mất khi bị ngắt).
- Builder đã có bước 1b gom nước lặng và bước 2 chấm lại kèm MultiPV (mục 4.3) — giữ nguyên.

### Bước 3 — Đo và đọc mẫu (bắt buộc trước khi giữ thế nào)

- `npx tsx scripts/audit-zhao-lessons.ts --extra … --only <tactic,…>`: đếm mỗi kỳ lý được gắn trên kho mở rộng, in mẫu.
- **Đọc từng lời bình bằng mắt** cho các bài đang trống: biến có đúng cơ chế bài giảng không (thẻ bài trong
  `zhao48-lessons.ts`: `principle`, `signals`), có khen bên thua không, quân được kể có đúng là quân làm nên hình không.
- Với bài vẫn 0, làm phễu như mục 4.3 (bộ nhận diện khớp → RULES → khen/chê + đáng bình → ưu tiên/bỏ lặp) để biết rớt ở đâu.
  Script phễu đã xóa; viết lại ở `scripts/.tmp-*`, xóa khi xong.
- Lỗi thật (như bài 31 từng có luật tự mâu thuẫn) thì sửa code + test thế thật, báo người dùng. Không phải lỗi thì ghi lý do.

### Bước 4 — Đưa ván có thế vào app và sinh lại

- Chép đúng các file `game_XXXXX.json` có thế được builder giữ từ kho riêng sang `.data/master-games/`, chạy
  `npx tsx scripts/generate-master-games-data.ts` để sinh lại `master-games.generated.ts`, rồi chạy builder lần cuối
  **không** `--extra` để chắc thế chỉ dựa trên `MASTER_GAMES`: `npx tsx scripts/build-zhao-benchmark.ts --per-lesson 3`.
- **Luôn `--per-lesson 3`** (mặc định 1 làm file co lại còn ~46 thế). Sao lưu `zhao-benchmark.generated.ts` trước khi chạy và so
  từng dòng trước/sau (bài nào mất thế phải giải thích được).

### Bước 5 — Kiểm

- `npx vitest run --project unit src/lib/xiangqi/zhao-benchmark-data.test.ts src/lib/xiangqi/zhao-principles.test.ts
  src/lib/xiangqi/move-outcome.test.ts src/lib/xiangqi/middlegame.test.ts src/lib/xiangqi/analysis.test.ts`
  (chỉ file liên quan; máy yếu). `npm run typecheck`. `npx eslint` trên file đã sửa — lỗi `prefer-const` `endPly` trong
  `checkOaTamKnight` có từ trước.
- Mở `/masters`, chọn vài bài mới trong modal "So sánh AI & Bài giảng": thế hiện đúng, kỳ lý được gắn khi đi nước của ván.
- Cập nhật mục 4.3 (số thế, bài còn trống, lý do).

### Việc phụ, độc lập

- **Bài 2, 10**: mỗi bài có 1 ứng viên trên 203 ván nhưng rớt khi chấm lại như modal (60k nodes, MultiPV 3, không lịch sử).
  Tìm vì sao (PV live ngắn hơn? cls khác? `playedNotationsOverride` — modal truyền `[]`, mục 6 khuyên `["—"]`) trước khi kết luận.
- **Ván có bình luận** ở `.data/expert-commentary/tlkd_*.json` (dạng `movesCoords`, không phải `moves_chinese`) có thể làm kho
  thứ ba, nhưng cần bộ đổi `movesCoords` → `Move` và metadata riêng; làm sau xqbase.
