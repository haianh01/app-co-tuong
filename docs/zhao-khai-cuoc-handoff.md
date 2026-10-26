# Bàn giao: kỳ lý khai cuộc Triệu Hâm Hâm

Tài liệu cho AI làm tiếp phần **khai cuộc** của "phân tích theo nguyên lý Triệu Hâm Hâm".
Trả lời người dùng bằng **tiếng Việt**.

Phải đọc hết mục 0–3 trước khi động vào code. Đọc thêm [zhao-ky-ly-handoff.md](zhao-ky-ly-handoff.md), tài liệu bàn giao
của phần trung / tàn cuộc: kiến trúc 4 tầng, hàm dùng chung và cạm bẫy ở đó áp dụng cả cho khai cuộc.

Việc chia thành **giai đoạn A → G**. Hết mỗi giai đoạn phải **dừng lại, báo cáo theo mẫu ở mục 5 và chờ người dùng duyệt**.
Không được làm gộp nhiều giai đoạn trong một lượt.

---

## 0. Luật bắt buộc

Đợt trước, AI làm modal "So sánh AI & Bài giảng" đã vi phạm **tất cả** các điều dưới đây, và toàn bộ phần đó phải làm lại.
Mỗi điều kèm việc đã xảy ra để thấy vì sao nó bị cấm.

| # | Cấm | Đã xảy ra |
|---|---|---|
| 1 | **Tự viết FEN.** Mọi thế cờ phải lấy từ ván thật (`MASTER_GAMES`, kỳ phổ trong `data/kypho*`), kèm mã ván và số nửa nước. | 20 "thế cờ mẫu" tự dựng: 4 thế có 3 Sĩ Đen (Pikafish treo), 4 thế có "nước mẫu" không hợp lệ. |
| 2 | **Bịa lời Triệu Hâm Hâm.** Câu đặt trong ngoặc kép hoặc ghi "Triệu Hâm Hâm nói" phải có **nguyên văn** trong phụ đề, đúng mốc `[MM:SS]`. Lời tóm tắt của mình ghi vào `principle`, không đặt trong ngoặc kép. | Trường `description` do AI tự viết được hiển thị trong khung trích dẫn như lời ông giảng. |
| 3 | **Ghi số không đo.** Không viết "100%", "chuẩn xác", "hoàn hảo"… Mọi con số phải có lệnh đo đi kèm, và người khác chạy lại phải ra đúng số đó. | Hiện "TRÙNG KHỚP 100%" trong khi chính script của AI in ra 7/20. Đo lại với engine thì 1/20. |
| 4 | **Báo xong khi chưa chạy kiểm tra.** Trước khi báo phải chạy typecheck, test của file liên quan và script đo, rồi dán kết quả thật (cả phần trượt). | Báo "đã hoàn thành" và liệt kê 20 bài như thể đều chạy đúng. |
| 5 | **Gắn kỳ lý mà biến engine không xác nhận.** Không kiểm chứng được thì không gắn: thà im còn hơn khen sai. | Modal gọi thẳng bộ nhận diện hình, bỏ qua `reviewMove` / `zhaoOutcomeAllows`. |
| 6 | **Câu dự phòng giả làm AI.** AI không nhận ra gì thì hiển thị đúng như vậy. | Câu cố định "[Triệu Hâm Hâm - Công sát]: Nước đi khai thông lộ tấn công…" hiện ra khi không có fact nào. |
| 7 | **Nới test hoặc nới ngưỡng cho vừa code.** Test lộ ra lỗi thì sửa code và báo người dùng. | — |
| 8 | **Thêm kỳ lý vào bảng `RULES` (zhao-outcome.ts) chỉ để nó hiện lên.** | — |
| 9 | **Xoá file, chạy `git commit`, `git push`, `git reset` khi người dùng chưa bảo.** | — |

Khi không chắc một điều có vi phạm không: **hỏi người dùng**, đừng đoán.

---

## 1. Bối cảnh

- Sản phẩm: web cờ tướng (Next.js 16, React 19, TypeScript). Engine luật cờ tự viết trong `src/lib/xiangqi/`.
  Engine mạnh là Pikafish, chạy trên server qua `getEnginePool()` ([src/server/engine/uci.ts](../src/server/engine/uci.ts)).
- **Trung cuộc**: 48 bài trong [zhao48-lessons.ts](../src/lib/xiangqi/zhao48-lessons.ts); bộ nhận diện trong
  [zhao-principles.ts](../src/lib/xiangqi/zhao-principles.ts).
- **Tàn cuộc**: 48 bài trong [zhao48-endgame-lessons.ts](../src/lib/xiangqi/zhao48-endgame-lessons.ts); bộ nhận diện trong
  [endgame-principles.ts](../src/lib/xiangqi/endgame-principles.ts).
- **Modal đối chiếu** ở /masters ([ZhaoPositionModal.tsx](../src/app/masters/ZhaoPositionModal.tsx)) lấy thế từ
  [zhao-benchmark.generated.ts](../src/lib/xiangqi/zhao-benchmark.generated.ts), sinh bởi
  [build-zhao-benchmark.ts](../scripts/build-zhao-benchmark.ts). Đây là **mẫu đúng** cho mọi dữ liệu thế cờ: lấy từ ván thật,
  rồi chấm lại bằng Pikafish đúng như giao diện sẽ chấm.
- **Khai cuộc chưa có bài giảng Triệu Hâm Hâm nào.** Phần khai cuộc hiện có **không** thuộc Triệu Hâm Hâm và phải giữ nguyên:

| Đã có | Ở đâu | Làm gì |
|---|---|---|
| Sách khai cuộc | [openings.ts](../src/lib/xiangqi/openings.ts): `OPENING_BOOK_LINES`, `isBookMove`, `getOpeningGuide`, `openingOf` | Nhận biến kinh điển, ý đồ hai bên (`intent`), nước sách tiếp theo |
| 10 lỗi khai cuộc | [strategy.ts](../src/lib/xiangqi/strategy.ts): `detectOpeningFault`, kiểu `OpeningFaultType` | Đi một quân nhiều lần, ra Xe muộn, Tượng biên, Mã biên… Gắn vào fact `openingFault` qua [explain.ts](../src/lib/xiangqi/explain.ts) |
| Hình khai cuộc | [opening-shapes.ts](../src/lib/xiangqi/opening-shapes.ts): `detectShapes`, `classifyOpeningType` | Nhận hình (Pháo đầu, Bình phong Mã…), loại khai cuộc (cấp công / hoãn công…) |

`detectOpeningFault` đã được siết trên ván đại sư: tổng số lỗi trên 3451 nước đầu ván giảm từ khoảng 915 xuống khoảng 140.
**Không được nới nó ra.** Muốn đổi gì ở đó phải trình người dùng trước.

---

## 2. Kiến trúc cần biết

**Luồng chấm một nước:** `reviewMove` ([analysis.ts](../src/lib/xiangqi/analysis.ts)) → `explainMove` (sinh fact) → lọc bằng
`keepZhaoFact` / `keepEndgameFact` → `review.facts`. Mọi kỳ lý mới phải đi qua đúng luồng này. Giao diện chỉ hiển thị
`review.facts`, không được gọi bộ nhận diện trực tiếp.

**Ba điểm riêng của khai cuộc, đọc kỹ:**

1. **Nước theo sách bị coi là `cls = "book"`.** Ở 16 nửa nước đầu, `isBookMove` đúng thì nước được phân loại "book",
   và `keepZhaoFact` **bỏ mọi kỳ lý Triệu Hâm Hâm** của nước đó ([analysis.ts:310](../src/lib/xiangqi/analysis.ts#L310)).
   Như vậy kỳ lý khai cuộc gắn vào nước theo sách sẽ không bao giờ hiện. Có nên gắn vào nước sách không (khen "đúng kỳ lý")
   là việc **người dùng quyết** ở giai đoạn C, AI không tự quyết.
2. **Biến engine ở khai cuộc hiếm khi có đòn quyết định.** Tầng 4 kiểu "sát hoặc thắng ≥ 2,5 Tốt" của trung cuộc gần như không
   bao giờ đạt. Khai cuộc phải đo bằng thứ khác: **độ mất điểm so với nước tốt nhất** (`loss`, xem `soundMove` trong
   [middlegame.ts](../src/lib/xiangqi/middlegame.ts)), hình có **còn giữ** sau vài nước của PV không, quân có ra được / bị kẹt thật
   không (đếm số nước đi hợp lệ của quân đó trước / sau). Mỗi bài phải có cơ chế đo được cụ thể, viết ra và được duyệt trước khi code.
3. **Ván bắt đầu giữa chừng.** Khi đưa thế giữa ván vào `reviewMove` như ván một nước, truyền `historyMovesOverride = []` và
   `playedNotationsOverride = []`, nếu không nước có thể bị coi là nước sách.
   Riêng khai cuộc thì **cần** lịch sử thật, vì `isBookMove` và `detectOpeningFault` đều đọc lịch sử. Vậy nên thế cờ đối chiếu
   cho khai cuộc phải chấm **trong cả ván** (dùng `reviewGame`), không cắt ra thành ván một nước. Xem giai đoạn G.

**Toạ độ:** ô = `hàng * 9 + cột`; hàng 0 là hàng đáy của Đen, hàng 9 là hàng đáy của Đỏ.
Điểm engine trong `PositionEval` tính theo **bên đến lượt**. `options.evalAfter.score` là điểm của **đối phương**
(tức −điểm bên vừa đi). `options.pv` là biến của thế **sau** nước đi, bắt đầu bằng nước đáp.

---

## 3. Môi trường

- Windows, 8 CPU / 16 GB, **máy yếu**. Không chạy cả bộ test. Chỉ chạy file liên quan, ví dụ
  `npx vitest run --project unit src/lib/xiangqi/<file>.test.ts`. Trước khi báo phải chạy `npm run typecheck`.
- Phụ đề video nằm ở `.data/expert-commentary/`, **không có trên git** vì có bản quyền. Tên file hiện có:
  `zhao48_baiNN_*.json` (trung cuộc) và `zhao48_endgame_baiNN_*.json` (tàn cuộc). Mỗi file có `transcript`: các dòng dạng
  `"[MM:SS] câu nói"`. Máy nào không có thư mục này thì **không làm được giai đoạn A–B**: báo người dùng và dừng.
- Pikafish: `getEnginePool()` trả `null` thì không có engine. **Đừng giả lập kết quả engine**, báo người dùng.
- Cache điểm engine của 203 ván đại sư: `.data/audit-cache/master-all-30000.json` (khoá là FEN). Script
  `npx tsx scripts/audit-zhao-lessons.ts` tự tạo cache nếu chưa có.
- Viết script tạm vào thư mục nháp, không vào `scripts/`, trừ khi đó là công cụ để lại cho dự án.
  Heredoc bash có tiếng Việt / dấu nháy hay vỡ: viết file `.ts` rồi chạy bằng `npx tsx`.

---

## 4. Các giai đoạn

### A. Kiểm kê phụ đề khai cuộc (chỉ đọc, không sửa code)

1. Liệt kê `.data/expert-commentary/`, tìm các file khai cuộc của Triệu Hâm Hâm. **Không đoán tên file.**
   Nếu không có file khai cuộc nào: báo người dùng và **dừng toàn bộ việc**. Không có nguồn thì không có kỳ lý khai cuộc.
2. Mỗi bài, ghi lại: số bài, tiêu đề **theo phụ đề**, mã video, độ dài, 3–5 câu nguyên văn quan trọng kèm mốc `[MM:SS]`,
   và bài đó nói về **nước đi cụ thể**, **kế hoạch / thế trận**, hay **tổng quát**.
3. Báo cáo dạng bảng, kèm đường dẫn file nguồn của từng bài.

✅ Xong khi: người dùng duyệt bảng kiểm kê.

### B. Thẻ bài `zhao48-opening-lessons.ts`

1. Tạo [src/lib/xiangqi/zhao48-opening-lessons.ts](../src/lib/xiangqi/zhao48-opening-lessons.ts) theo **đúng kiểu** của
   `ZhaoEndgameLessonCard` (`lesson`, `title`, `principle`, `signals`, `quotes`, `kind`, `video`, `tacticId`).
   - `quotes`: chỉ chép nguyên văn từ phụ đề, đúng mốc giờ. Không sửa chữ, không dịch lại.
   - `principle`: tóm tắt bằng lời mình, 1–3 câu, không phóng đại.
   - `kind`: `detectable` (gắn vào từng nước, phải kiểm biến engine), `evaluative` (ghi chú một lần), `summary` (không gắn).
     **Khi phân vân thì chọn `summary`.**
2. Tạo `zhao48-opening-lessons.test.ts` theo mẫu [zhao48-endgame-lessons.test.ts](../src/lib/xiangqi/zhao48-endgame-lessons.test.ts):
   mọi `quote` phải có nguyên văn trong phụ đề đúng mốc giờ (`it.skipIf` khi máy không có `.data/expert-commentary`),
   `video` đúng 11 ký tự, mỗi bài có `signals`.
3. Chạy test đó **trên máy có phụ đề**. Dán kết quả vào báo cáo.

✅ Xong khi: test trích dẫn qua trên máy có phụ đề, typecheck sạch.

### C. Thiết kế từng bài (chỉ viết tài liệu, chưa code)

Với **mỗi** bài `detectable` / `evaluative`, viết một mục trong báo cáo gồm:

| Mục | Nội dung |
|---|---|
| Bài giảng nói gì | 1–2 câu, dẫn quote |
| Trùng với cái đã có? | So với 10 lỗi `detectOpeningFault`, các biến `OPENING_BOOK_LINES`, các hình `opening-shapes.ts`. **Trùng thì đề xuất gắn số bài vào cái đã có, không viết bộ nhận diện thứ hai.** |
| Tầng 1 — Hình | Điều kiện trên bàn cờ, viết bằng quân và ô cụ thể |
| Tầng 2 — Mục đích | Khi nào hình có nhưng nước đi vì việc khác (ăn quân, chạy quân bị dọa, đỡ chiếu…) → loại |
| Tầng 3 — Cơ chế | Đo **trên PV engine**, như số nước đi hợp lệ của quân X trước / sau, hình còn sau N nửa nước, đối phương phải đáp bằng nước Y |
| Tầng 4 — Kết quả | Ngưỡng `loss` / điểm engine. Lời khen chỉ khi nước không hớ; lời chê chỉ khi nước bị chấm lỗi (`isFault`) |
| Khen hay chê | Và có gắn vào nước theo sách không (xem mục 2 điểm 1) |
| Không đo được? | Nói thẳng, đề xuất để `summary` |

Kèm một câu hỏi rõ ràng cho người dùng: **kỳ lý khai cuộc có được gắn vào nước theo sách không**, và nếu có thì khen theo cách nào.

✅ Xong khi: người dùng duyệt thiết kế từng bài và trả lời câu hỏi về nước sách.

### D. Bộ nhận diện + test

1. Viết `checkXxx(before, move, after, options): PrincipleCheck | null`, trả cả tầng trượt và lý do giống
   `checkDeepCannonBottom` trong zhao-principles.ts. `detectXxx` chỉ gọi nó rồi dựng fact.
   Đặt trong file mới `src/lib/xiangqi/opening-principles.ts`. Không nhồi vào strategy.ts hay zhao-principles.ts.
2. Lời bình kể đúng chuyện xảy ra trong biến (dùng `narrate`, `tally`, `pieceRole` của
   [engine-line.ts](../src/lib/xiangqi/engine-line.ts)). Không dùng câu khuôn kiểu "tất thắng", "thế hiểm nghèo",
   "khống chế hoàn toàn".
3. **Test** (`opening-principles.test.ts`), cho mỗi bài:
   - ít nhất 1 ca `ok: true` lấy **thế thật từ ván đại sư** kèm PV từ cache audit (ghi mã ván + nửa nước trong comment), kiểm cả
     nội dung lời bình;
   - mỗi tầng một ca trượt đúng tầng (`toMatchObject({ ok: false, layer: N })`);
   - một ca "có hình nhưng không có dữ liệu engine thì không gắn".
   Không dựng thế đồ chơi. Không viết test cho vừa với code.
4. Chạy `npx vitest run --project unit src/lib/xiangqi/opening-principles.test.ts` và `npm run typecheck`.

✅ Xong khi: test qua, typecheck sạch, kết quả dán trong báo cáo.

### E. Nối vào `reviewMove`

1. Thêm kiểu fact mới `zhaoOpening` trong [explain.ts](../src/lib/xiangqi/explain.ts), có `lesson`, `lessonTitle`, `quote`,
   `videoUrl` như `EndgamePrincipleFact`. Thêm câu chữ cho fact đó trong `explainText`.
2. Thêm bộ lọc `keepOpeningFact` trong analysis.ts theo đúng quyết định ở giai đoạn C (nước sách, khen / chê theo `isFault`).
3. Tối đa 1 kỳ lý khai cuộc mỗi nước. Không trùng nội dung với fact `openingFault` cùng nước: nếu trùng thì chỉ giữ một.
4. **Không làm chậm `reviewGame`**: có test hiệu năng ở [analysis.test.ts](../src/lib/xiangqi/analysis.test.ts)
   ("hiệu năng: reviewGame cho ván 80 nửa nước…"). Đo trước và sau bằng chính test đó. Bộ nhận diện phải lọc rẻ trước,
   chỉ đi PV khi hình đã khớp.
5. Chạy test của analysis, explain, opening-principles và typecheck.

✅ Xong khi: test qua, có số đo hiệu năng trước / sau.

### F. Đo trên 203 ván đại sư

1. Viết `scripts/audit-opening-principles.ts` theo mẫu [audit-zhao-lessons.ts](../scripts/audit-zhao-lessons.ts): chạy đúng
   `reviewGame` của app, đếm mỗi kỳ lý khai cuộc được gắn bao nhiêu lần (khen / chê), in mẫu (mã ván, nửa nước, FEN, lời bình).
2. **Đọc mẫu bằng mắt.** Đại sư hiếm khi đi sai ở khai cuộc, nên kỳ lý chê bắn nhiều trên ván đại sư nghĩa là điều kiện quá rộng.
   Kỳ lý khen phải nói đúng điều biến engine cho thấy, và không được khen bên thua một cách vô lý.
3. Báo cáo: tỉ lệ nước khai cuộc (≤ 24 nửa nước đầu) có kỳ lý; số lần gắn của từng bài; 3 mẫu mỗi bài; các bài không bắn lần nào.
   Số `openingFault` trước / sau phải **không đổi**, trừ khi người dùng đã duyệt thay đổi.

✅ Xong khi: người dùng đọc mẫu và duyệt.

### G. Giao diện /masters + thế đối chiếu

1. Tab thứ ba "Khai cuộc" trong [ZhaoLessonsSection.tsx](../src/app/masters/ZhaoLessonsSection.tsx) (`TabType`), đọc từ thẻ bài
   khai cuộc.
2. Mở rộng `book` thành `"middlegame" | "endgame" | "opening"` ở các chỗ sau:
   - [build-zhao-benchmark.ts](../scripts/build-zhao-benchmark.ts);
   - [zhao-benchmark-data.ts](../src/lib/xiangqi/zhao-benchmark-data.ts) (`ZHAO_BOOK_NAME`, `cardOf`, `ZHAO_BENCHMARK_MAP`);
   - [ZhaoPositionModal.tsx](../src/app/masters/ZhaoPositionModal.tsx) (`bookOf`, `factKey`, nhóm trong ô chọn);
   - [settings.ts](../src/app/play/settings.ts) (`book`) và banner trong [PlayClient.tsx](../src/app/play/PlayClient.tsx).
3. **Thế đối chiếu khai cuộc phụ thuộc lịch sử** (mục 2 điểm 3). Modal hiện chấm theo kiểu ván một nước. Với khai cuộc phải
   lưu cả chuỗi nước từ đầu ván đến thế đó, rồi chấm bằng `reviewGame` trên chuỗi ấy. Trình thiết kế cho người dùng trước khi sửa modal.
4. Sinh dữ liệu **chỉ bằng script**, không sửa tay file `.generated.ts`. Chạy `npx tsx scripts/build-zhao-benchmark.ts --per-lesson 3`.
5. Mở rộng [zhao-benchmark-data.test.ts](../src/lib/xiangqi/zhao-benchmark-data.test.ts): thế khai cuộc cũng phải khớp ván gốc.
6. Kiểm trên trình duyệt thật (dev server `http://localhost:3000/masters`): mở tab Khai cuộc, mở modal, đợi engine chấm xong,
   ghi lại câu trạng thái hiện ra. Không có lỗi console.

✅ Xong khi: test qua, typecheck và lint sạch, đã kiểm trên trình duyệt, người dùng duyệt.

---

## 5. Mẫu báo cáo sau mỗi giai đoạn

```
Giai đoạn X — <tên>

Đã làm:
- <file>: <thay đổi, 1 dòng>

Đã kiểm (dán lệnh + kết quả thật):
- npm run typecheck → <kết quả>
- npx vitest run ... → <N passed / M failed>
- <script đo> → <con số>

Chưa đạt / còn nghi ngờ:
- <ghi thẳng, kể cả khi xấu>

Cần người dùng quyết:
- <câu hỏi cụ thể, kèm phương án và đề xuất>
```

Không viết lời quảng cáo ("hoàn hảo", "đỉnh cao", "100%"). Không dùng emoji trong báo cáo kỹ thuật.
Không liệt kê việc chưa chạy như thể đã chạy.

---

## 6. Cạm bẫy đã gặp

- Pikafish **treo** ở thế không hợp lệ (vd. 3 Sĩ) hoặc thế rất ít quân dựng tay. Lại thêm một lý do chỉ dùng thế thật.
- `/api/engine` trả 503 khi không có engine, và trình duyệt **tự chuyển sang AI JavaScript** yếu hơn. Đừng ghi "Pikafish" trên
  giao diện như thể chắc chắn đó là Pikafish.
- `parseFen` chỉ kiểm hàng và cột, không kiểm số Tướng / Sĩ. Dữ liệu ngoài vào phải kiểm thêm (xem `parseSettings`).
- Ở 30k nodes, PV hay chỉ có 1 nước. Đừng hạ ngưỡng chỉ vì lý do này.
- Số bài của ba bộ (trung / tàn / khai cuộc) **trùng nhau** (đều 1–48). Luôn tra theo cặp `(book, lesson)`, không bao giờ tra
  theo `lesson` đơn lẻ. Đã có lỗi thẻ tàn cuộc bài 4 mở nhầm thế trung cuộc bài 4.
- `setState` trong `useEffect` để đồng bộ props bị lint chặn (`react-hooks/set-state-in-effect`). Hãy remount component bằng `key`.
- Next.js trong repo này là bản mới, có thay đổi phá vỡ. Đọc `node_modules/next/dist/docs/` trước khi viết code Next.
- Các test hiệu năng có ngưỡng thời gian tuyệt đối (analysis, phases, intent, middlegame, threats) hay trượt khi máy bận.
  Chạy riêng file đó để xác nhận trước khi kết luận.
