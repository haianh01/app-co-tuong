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

Kết quả sinh lại (`--per-lesson 3`): 105 → 109 thế. Thêm bài 25 (7261 #61), 30 (1266 #78), thêm thế cho 17, 19, 22;
bài 28 dời 1211 #72 → #62. Tàn cuộc không đổi. Trung cuộc còn trống: 2, 4, 7, 9, 10, 12, 15, 18, 20, 23, 26, 27, 31, 33, 34, 37
(37: 2 nước lặng đều rớt khi chấm lại; 2, 10: ứng viên duy nhất vẫn rớt khi chấm lại).

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
- Máy này không có `.data/expert-commentary` (bản ghi video ở máy khác) nên test đối chiếu trích dẫn tự skip — bình thường.
- Muốn có số "trước" mà không đụng cây làm việc: `git worktree` + junction tới `node_modules`, `engine`, `.data`; gỡ junction bằng
  `rmdir` trước khi `git worktree remove`.
