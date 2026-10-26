# Bàn giao: trình chiếu cờ thế lên sân khấu livestream

Tài liệu cho AI / người làm tính năng "chiếu cờ thế" trên sân khấu tường thuật (OBS Browser Source).
Trả lời người dùng bằng tiếng Việt. Đọc hết mục 1–3 trước khi sửa code. Đọc thêm `AGENTS.md` (Next.js 16 có thay đổi
phá vỡ, xem tài liệu trong `node_modules/next/dist/docs/` trước khi viết route/page mới).

## 1. Mục tiêu

Người dẫn live chọn một thế cờ, chiếu lên sân khấu như một **tiết mục**: giới thiệu thế → khán giả suy nghĩ (đếm ngược,
bình luận đáp án trên chat) → gợi ý → lật đáp án từng nước có mũi tên và lời kể → thẻ kết quả. Người dẫn bấm điều khiển
ở trang tường thuật. Sân khấu chỉ nhận trạng thái và hiển thị.

Khác biệt với trang `/puzzle`: ở đây **không** chấm sao, **không** thưởng xu, **không** gọi server action của cờ thế.
Đây chỉ là trình chiếu.

## 2. Những gì đã có (dùng lại, đừng viết mới)

| Thành phần | File | Ghi chú |
|---|---|---|
| Kênh điều khiển → sân khấu | [stage-protocol.ts](../src/lib/stage-protocol.ts), [stage-relay.ts](../src/server/stage-relay.ts) | `/ws/stage?room=…&role=control\|view`. Server không đọc `state`, chỉ giữ tin cuối. **Không cần sửa server.** |
| Kiểu trạng thái sân khấu | [stage-sync.ts](../src/app/tuong-thuat/stage-sync.ts) | `StageState`, `buildStageState`, `canReview` |
| Trang sân khấu 1080×1920 (dọc) | [san-khau/StageClient.tsx](../src/app/tuong-thuat/san-khau/StageClient.tsx), `stage.module.css` | Có sẵn nhánh hiển thị `state.review` để làm mẫu |
| Trang điều khiển | [StagePanel.tsx](../src/app/tuong-thuat/StagePanel.tsx), [BroadcastClient.tsx](../src/app/tuong-thuat/BroadcastClient.tsx), [ziga/ZigaBroadcastClient.tsx](../src/app/tuong-thuat/ziga/ZigaBroadcastClient.tsx) | Cả hai client đều gọi `buildStageState(...)` rồi `sendStage` |
| **Mẫu tham chiếu chính: chiếu phân tích ván** | [StageReviewControl.tsx](../src/app/tuong-thuat/StageReviewControl.tsx) | `StageReviewState` → `review` trong `buildStageState` → StageClient vẽ badge, header, thanh dưới. Cờ thế đi **đúng con đường này**. |
| Dữ liệu cờ thế | [puzzles.ts](../src/lib/xiangqi/puzzles.ts) (`PUZZLES`, `findPuzzle`, kiểu `Puzzle`) | ~100 thế: sát 1–2 nước (generated) + liên sát 3+ nước (deep, có `line` đã kiểm Pikafish, có `source`) |
| Kiểm nước / nước đỡ của Đen | [mate.ts](../src/lib/xiangqi/mate.ts): `moveWins`, `winningMoves`, `toughestReply`, `lineMoveOk` | Cách dùng mẫu: `onSquareClick` trong [PuzzleClient.tsx](../src/app/puzzle/PuzzleClient.tsx) |
| Ký hiệu nước | `moveNotation(board, move)` trong [notation.ts](../src/lib/xiangqi/notation.ts) | |
| Giọng nói / âm thanh sân khấu | [stage-voice.ts](../src/lib/stage-voice.ts), tin `{ t: "voice" }` | |
| Hiệu ứng lớn | `BigMoment` / `useMoment` trong StageClient | Có thể dùng cho "CHIẾU BÍ!" khi lật đáp án nước cuối |

## 3. Thiết kế

### 3.1 Trạng thái mới trong `stage-sync.ts`

```ts
export type StagePuzzlePhase = "intro" | "thinking" | "hint" | "reveal" | "solved";

export interface StagePuzzleState {
  puzzleId: string;
  title: string;
  chapter: string;
  goal: string;          // "Đỏ đi trước, chiếu bí trong 3 nước."
  source?: string;
  depth: number;
  phase: StagePuzzlePhase;
  board: Board;          // thế đang hiển thị (thế đầu, hoặc sau k nước khi đang lật đáp án)
  lastMove: Move | null;
  arrows: BoardArrow[];
  highlights: (number | BoardHighlight)[];
  /** Số nửa nước đáp án đã lật / tổng số nửa nước. */
  revealPly: number;
  totalPlies: number;
  /** Ký hiệu các nước ĐÃ lật. Chỉ chứa những nước đã lật, tuyệt đối không gửi trước cả lời giải. */
  revealed: string[];
  /** Lời kể nước vừa lật, ví dụ "Xe thí quân để mở đường cho Mã". */
  caption?: string | null;
  /** Chỉ có khi phase === "hint". */
  hintText?: string | null;
  /** Đếm ngược cho khán giả: sân khấu tự tính phần còn lại từ startedAt, giống StageClocks.sentAt. */
  countdown?: { startedAt: number; durationMs: number } | null;
}
```

Thêm `puzzle?: StagePuzzleState | null` vào `StageState` và tham số `puzzle` vào `buildStageState`.
**`review` và `puzzle` loại trừ nhau.** Bật cái này thì tắt cái kia, ở cả trang điều khiển lẫn khi dựng trạng thái.

### 3.2 Quy tắc bắt buộc

1. **Chống lộ đáp án.** Lời giải chỉ nằm ở trang điều khiển. Tin gửi sân khấu (và tin `last` mà relay giữ lại) chỉ được
   chứa những nước đã lật. Trước phase `reveal`, `arrows` không được có mũi tên nào chỉ nước giải. Phải có test cho
   quy tắc này.
2. **Chống gian lận khi đang đánh.** Chỉ cho chiếu cờ thế khi `canReview(gameOver, plies)` đúng, tức là trước ván hoặc sau
   khi ván kết thúc. Nút bị khóa khi ván đang diễn ra, giống nút "🎬 Phân tích lên sân khấu".
3. **Hướng bàn cờ.** Cờ thế luôn là Đỏ đi trước, nên khi chiếu cờ thế thì Đỏ ở dưới, bất kể `mySide` của ván thật.
4. Giao diện tiếng Việt, thuật ngữ chuẩn (Xe, Pháo, Mã, Tượng, Sĩ, Tướng, Tốt, chiếu bí…), giữ nguyên phong cách màu đang
   dùng trong `stage.module.css`.

### 3.3 Dựng biến lời giải đầy đủ (chạy ở trang điều khiển)

Viết hàm thuần `puzzleSolutionLine(puzzle: Puzzle): Move[]` trong file mới `src/app/tuong-thuat/stage-puzzle.ts`:
- Có `puzzle.line` thì dùng luôn (đã kiểm Pikafish).
- Không có (thế 1–2 nước): nước Đỏ đầu là `puzzle.solution`. Đen đáp bằng `toughestReply`. Các nước Đỏ sau lấy từ
  `winningMoves(pos, nLeft, true)[0]`. Làm theo đúng cách PuzzleClient đang làm, đọc kỹ ý nghĩa tham số `n` trong `mate.ts`.
- Test: với **mọi** phần tử của `PUZZLES`, đi hết biến thì `outcome(...)` phải là Đỏ thắng, và số nước Đỏ bằng `depth`.

Trong cùng file: `buildPuzzleStage(puzzle, phase, revealPly, opts) → StagePuzzleState`. Đây là hàm thuần, dễ test, gồm
áp các nước đã lật, sinh `revealed` bằng `moveNotation`, mũi tên cho nước vừa lật, và `highlights` quân gợi ý ở phase
`hint` (ô `puzzle.solution.from`).

### 3.4 Trang điều khiển: `StagePuzzleControl.tsx` (mới, đặt cạnh StageReviewControl)

- Chọn thế: lọc theo chương, có ô tìm theo tên; hiện tên, chương, số nước, nguồn.
- Nút theo tiết mục: **Lên sân khấu** (intro) → **Bắt đầu đếm ngược** (30/60/90 giây, chọn được) → **Gợi ý** → **Lật
  nước tiếp** / **Lùi một nước** / **Tự lật hết** (mỗi nửa nước cách nhau ~2,5 giây) → **Kết thúc** (tắt chế độ cờ thế,
  sân khấu về ván thật).
- Ô xem trước riêng cho người dẫn, có **toàn bộ lời giải** (để người dẫn nắm đáp án) và ghi rõ "Chỉ bạn thấy".
- Ô sửa lời kể (`caption`) cho từng nước trước khi lật. Mặc định để trống, hoặc dùng `hint` của thế cho nước đầu.
  Không bịa lời kể tự động.
- Gắn vào `StagePanel` giống khối review (nút mở, prop `puzzle` / `onUpdatePuzzle`). Nối state ở **cả** `BroadcastClient`
  và `ZigaBroadcastClient`, truyền `puzzle` vào `buildStageState`.

### 3.5 Trang sân khấu (`StageClient.tsx`)

Theo mẫu nhánh `review` (tìm `const review = state.review` và `data-review`):
- Bàn cờ hiển thị `puzzle.board`, `lastMove`, `arrows`, `highlights`. Không cho chọn quân trên sân khấu.
- Badge trên bàn cờ: `CỜ THẾ · {chapter}`, tương tự `reviewBadge`.
- Khung header: tên thế, mục tiêu (`goal`), nguồn, "Nước {k}/{depth}" khi đang lật.
- Đếm ngược lớn khi phase `thinking`, tự tính từ `countdown`, dùng `useNow` có sẵn. Hết giờ thì hiện "HẾT GIỜ", không tự
  lật đáp án (người dẫn quyết định).
- Phase `hint`: hiện `hintText` và vòng sáng quanh quân cần đi.
- Phase `reveal`: thanh dưới hiện chuỗi `revealed` cùng `caption` của nước vừa lật.
- Nước cuối lật xong (Đỏ chiếu bí) thì phase `solved`: dùng hiệu ứng `BigMoment` kiểu `mate` với tiêu đề "CHIẾU BÍ!" và
  phát âm thanh thắng.
- Thêm thế mẫu vào chế độ `?preview=1` (xem `getPreviewZigaState`) để kiểm giao diện không cần trang điều khiển.

## 4. Thứ tự làm

1. `stage-puzzle.ts` + `stage-puzzle.test.ts` (dựng biến lời giải, `buildPuzzleStage`, test chống lộ đáp án).
2. Kiểu `StagePuzzleState` + tham số `puzzle` trong `buildStageState`, kèm test trong `stage-sync.test.ts`.
3. Hiển thị trên `StageClient` + preview, kèm test UI trong `StageClient.test.tsx`.
4. `StagePuzzleControl` + gắn vào `StagePanel`, `BroadcastClient`, `ZigaBroadcastClient`, kèm test khóa nút khi ván đang
   diễn ra.
5. Chạy `npm run test:unit`, `npm run typecheck`, `npm run lint`. Tất cả phải xanh.
6. Kiểm tay: `npm run dev`, mở `/tuong-thuat` (điều khiển) và link sân khấu ở một tab khác (hoặc trong OBS), chạy hết một
   tiết mục với một thế 1 nước và một thế liên sát 3+ nước.

## 5. Tiêu chí xong

- [ ] Chạy trọn tiết mục intro → thinking → hint → reveal → solved trên sân khấu, điều khiển hoàn toàn từ trang tường thuật.
- [ ] Tải lại sân khấu (OBS refresh) giữa chừng thì hiện đúng trạng thái hiện tại và không lộ nước chưa lật.
- [ ] Không bật được khi ván đang diễn ra. Bấm "Kết thúc" thì sân khấu về đúng ván thật.
- [ ] Mọi thế trong `PUZZLES` dựng được biến lời giải dẫn tới chiếu bí (có test).
- [ ] Không đổi `stage-relay.ts`, giao thức `/ws/stage`, schema DB hay logic `/puzzle`.
- [ ] Test, typecheck, lint xanh. Không commit `AGENTS.md` nếu `next dev` tự sửa nó (xem ghi chú trong file đó).

## 6. Ngoài phạm vi (ghi lại, chưa làm)

- Đọc chat livestream để đếm khán giả trả lời đúng / bảng xếp hạng khán giả.
- Danh sách phát nhiều thế liên tiếp ("chuỗi 5 thế").
- Thế cờ do người dẫn tự bày (nhập FEN). Nếu làm, phải kiểm bằng `forcesWin` trước khi cho lên sân khấu.

## 7. Câu hỏi mở cho chủ dự án

- Có cho chiếu các thế đang gắn `vip: true` không? Dữ liệu vốn đã nằm trong bundle client. Mặc định: **cho**, vì đây là
  quảng bá.
- Có thêm dòng kêu gọi kiểu "Giải thử tại <site>/puzzle" trên thẻ kết quả không? Mặc định: có, lấy domain từ
  `src/lib/site.ts`.
