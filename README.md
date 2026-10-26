# Kỳ Đài – Cờ tướng online

Web chơi cờ tướng bằng tiếng Việt, giao diện theo phong cách các app cờ Trung Quốc, dùng tốt trên máy tính và điện thoại.

**Chơi**
- Đấu online với người thật: tính điểm Elo hoặc giao hữu, 5 thể thức (3+2 … 20+0), ghép theo Elo gần nhau, chat nhanh, đấu lại, người xem, chơi thử bằng tài khoản khách.
- Phòng bạn bè: tạo link mời và gửi qua Zalo hay Messenger; bạn bè bấm vào là vào ván, kể cả khi chưa có tài khoản.
- Giải đấu Arena tự động mỗi ngày: trưa 3+2, tối 5+3, thêm Chủ nhật 10+0. Đấu liên tục, thưởng xu và khung avatar.
- Cờ úp (揭棋): chơi với máy hoặc đấu online.
- Chơi với máy (5 cấp, chạy trong Web Worker) và AI phân tích ván.
- Cờ thế: 3 thế kinh điển cùng 42 thế tự sinh có kiểm chứng (sát 1 nước miễn phí, sát 2 nước dành cho VIP).

**Tài khoản và cộng đồng**
- Đăng ký, đăng nhập, Google/Facebook, quên mật khẩu, xác nhận email, cài đặt, xóa tài khoản.
- Hồ sơ có huy hiệu và thống kê khai cuộc.
- Bảng xếp hạng Elo và bảng xếp hạng mùa giải theo tháng (top 10 nhận thưởng tự động).
- Báo cáo vi phạm, trang quản trị.

**Kiếm tiền**
- Xu: nhận từ điểm danh 7 ngày, nhiệm vụ hằng ngày, giải cờ thế, giải đấu, mùa giải; tiêu vào bàn cờ, quân cờ, khung avatar và gợi ý cờ thế.
- VIP: phân tích ván không giới hạn, 300 xu mỗi ngày, chương cờ thế VIP, skin VIP.
- Thanh toán qua VNPay (hoặc cổng giả lập để chạy thử).

> "Kỳ Đài" là tên tạm. Tên, địa chỉ trang và email liên hệ nằm ở `src/lib/site.ts`.

## Chạy dự án

Cần Node.js 20 trở lên. Khi phát triển không cần cài PostgreSQL, vì app tự dùng PGlite (PostgreSQL chạy nhúng, dữ liệu ở `.data/pglite`).

```bash
npm install
npm run dev          # http://localhost:3000 – Next.js + server game chung một cổng
npm test             # toàn bộ test: unit, giao diện, tích hợp (WebSocket thật + PostgreSQL nhúng)
npm run test:e2e     # build rồi chạy Playwright (PW_CHANNEL=msedge để dùng Edge/Chrome có sẵn)
npm run typecheck
npm run lint
npm run build && npm start
```

### Engine cờ tướng (Pikafish)

Máy cấp Trung bình, Khó, Đại sư, nút Gợi ý, phân tích ván và huấn luyện dùng engine Pikafish chạy trên server (`/api/engine`). Cấp Tân thủ và Dễ dùng AI JavaScript trong trình duyệt. Không có engine thì mọi thứ tự quay về AI JavaScript (yếu hơn nhiều).

- Docker: ảnh tự tải Pikafish (`scripts/fetch-engine.sh`).
- Máy phát triển: đặt file chạy và `pikafish.nnue` vào thư mục `engine/` (`pikafish-windows.exe` hoặc `pikafish-linux`), lấy từ [bản phát hành Pikafish](https://github.com/official-pikafish/Pikafish/releases). Trên Linux/macOS có 7z thì chạy `sh scripts/fetch-engine.sh`.

Cấp quyền quản trị cho một tài khoản đã đăng ký: `npm run admin:promote -- <tên đăng nhập>`, hoặc khai báo `ADMIN_USERNAMES`.

### Chuyển sang máy khác

App chạy được chỉ với repo này: dữ liệu app cần (ván đại sư, cờ thế, thế đối chiếu Triệu Hâm Hâm) đã sinh sẵn thành `src/lib/xiangqi/*.generated.ts`.
Dữ liệu nghiên cứu mà các script cần (kỳ phổ `data/`, phụ đề `.data/expert-commentary`, cache Pikafish `.data/audit-cache`,
`.data/puzzle-mining`) có bản quyền nên **không** nằm trên repo công khai này. Chúng được đồng bộ với một repo GitHub **riêng tư**
(`DATA_REPO_URL` trong `.env`) bằng `scripts/data-sync.mjs`.

Máy mới:

1. `git clone` repo này rồi `npm ci`.
2. Chép `.env` từ máy cũ. File này chứa khoá bí mật, không đưa lên git; có `DATA_REPO_URL`.
3. Đặt Pikafish vào `engine/` (mục trên).
4. `npm run data:pull` để lấy dữ liệu nghiên cứu.

Máy cũ, sau khi dữ liệu thay đổi: `npm run data:status` để xem, `npm run data:push` để gửi lên.
Nếu cùng một file bị sửa ở hai máy, lệnh dừng lại và cho chọn `npm run data:push -- --mine` (giữ bản máy này) hoặc
`npm run data:pull -- --force` (lấy bản trên repo). DB dev (`.data/pglite`) không được đồng bộ: máy mới bắt đầu với DB trống.

### Biến môi trường

Xem đầy đủ trong `.env.example`. App tự nạp file `.env` khi khởi động.

| Biến | Bắt buộc khi chạy thật? | Ý nghĩa |
|---|---|---|
| `PUBLIC_URL` | **Có** | Địa chỉ công khai, ví dụ `https://kydai.vn`. Dùng trong email, URL trả về của VNPay, OAuth callback. |
| `DATABASE_URL` | **Có** | PostgreSQL. Để trống thì dùng PGlite, chỉ hợp để chạy thử. |
| `PORT` | | Cổng HTTP và WebSocket (mặc định 3000). |
| `CONTACT_EMAIL` | | Email liên hệ hiện ở chân trang và trang pháp lý. |
| `ADMIN_USERNAMES` | | Các tài khoản được cấp quyền quản trị mỗi lần khởi động (phân cách bằng dấu phẩy). |
| `RESEND_API_KEY`, `MAIL_FROM` | **Có** (để gửi email) | Gửi email qua [Resend](https://resend.com). Không có thì email chỉ được in ra log. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Tùy | Đăng nhập Google. Callback: `{PUBLIC_URL}/api/auth/google/callback`. |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | Tùy | Đăng nhập Facebook. Callback: `{PUBLIC_URL}/api/auth/facebook/callback`. |
| `PAYMENT_PROVIDER` | | `vnpay`, hoặc `mock` (cổng giả lập, **không bật khi chạy thật**). Để trống thì tắt thanh toán. |
| `VNP_TMN_CODE`, `VNP_HASH_SECRET`, `VNP_URL` | **Có** (để bán hàng) | Khóa merchant VNPay. `VNP_URL` mặc định là sandbox. IPN URL: `{PUBLIC_URL}/api/payments/vnpay/ipn`. |
| `ENGINE_PATH` | | File chạy engine UCI (mặc định `engine/pikafish-…`). |
| `ENGINE_EVAL_FILE` | | File mạng nơ-ron của engine (mặc định `pikafish.nnue` cạnh file chạy). |
| `ENGINE_POOL` | | Số tiến trình engine chạy song song (mặc định 2, mỗi tiến trình dùng 1 nhân CPU). |
| `ALLOWED_ORIGINS` | | Các origin khác host được phép mở WebSocket. |
| `COOKIE_SECURE` | | Đặt `false` nếu chạy qua HTTP thường (không khuyến khích). |

Migration trong `drizzle/` tự chạy khi khởi động. Sau khi sửa `src/server/db/schema.ts`, chạy `npm run db:generate`.

### Giá bán

Giá trong `src/lib/products.ts` **chỉ là ví dụ**: VIP 30 ngày 49.000 ₫, VIP 1 năm 399.000 ₫, 5.000 xu 20.000 ₫, 30.000 xu 99.000 ₫. Giá vật phẩm (tính bằng xu) nằm trong `src/lib/skins.ts`. Thưởng điểm danh, nhiệm vụ, mùa giải và giải đấu nằm trong `src/server/economy.ts` và `src/server/tournaments.ts`.

## Kiến trúc

```
server.ts                   Next.js + server game (WebSocket /ws) trong một tiến trình; lịch giải, thưởng mùa
scripts/                    promote-admin.ts, generate-puzzles.ts (sinh cờ thế có kiểm chứng), brand assets
src/lib/xiangqi/            Lõi cờ, thuần TypeScript, dùng chung client và server
  engine.ts, notation.ts    Luật, FEN, ký hiệu Việt Nam (P2-5, M8.7…)
  game.ts                   Ván đấu: biên bản, hòa, cấm chiếu mãi / đuổi bắt mãi
  ai.ts, analysis.ts        AI alpha-beta, phân tích ván
  jieqi.ts, jieqi-ai.ts     Cờ úp và máy chơi cờ úp
  mate.ts, puzzles*.ts      Tìm sát cục ép buộc, kiểm lời giải; dữ liệu cờ thế
  openings.ts               Nhận diện khai cuộc
src/lib/online/protocol.ts  Giao thức WebSocket (kiểm tra mọi dữ liệu từ client)
src/server/                 Chỉ chạy trên server
  db/                       Schema Drizzle, PostgreSQL / PGlite
  auth.ts, account.ts, oauth.ts, mailer.ts     Tài khoản, phiên đăng nhập, email
  economy.ts, payments.ts, puzzles.ts           Xu, VIP, cửa hàng, mùa giải, VNPay, cờ thế
  tournaments.ts, admin.ts, queries.ts          Giải Arena, quản trị, truy vấn trang
  game/server.ts            WebSocket: ghép cặp, phòng bạn bè, Arena, người xem
  game/room.ts, variants.ts, jieqi-room.ts      Một ván online (cờ tướng / cờ úp)
  game/persist.ts, store.ts Lưu ván + Elo (+ điểm giải) trong một transaction; lưu ván dở để khôi phục
src/app/                    Các trang (App Router)
tests/e2e/                  Playwright
```

### Đấu online hoạt động thế nào

- **Server là trọng tài:** mọi nước đi được kiểm tra lại trên server, đồng hồ do server tính. Với cờ úp, server giữ bố cục bí mật và chỉ gửi quân khi được lật.
- **Ghép cặp:** theo thể thức, chế độ và loại ván. Ván tính điểm ưu tiên Elo gần nhau; khoảng chênh được nới dần theo thời gian chờ.
- **Mở đầu, mất kết nối:** bên nào không đi nước đầu trong 30 giây thì ván bị hủy. Rời ván quá 60 giây thì bị xử thua.
- **Khởi động lại server:** ván đang chơi được lưu liên tục và khôi phục khi server chạy lại; đồng hồ không bị trừ thời gian server tắt.
- **Elo:** K = 40 với người dưới 30 ván, K = 20 từ 30 ván trở lên.
- **Arena:** thắng 2 điểm, hòa 1 điểm; đang thắng liền 2 ván thì ván thắng tiếp được 4 điểm. Hết giờ, giải chờ các ván dở (tối đa 30 phút) rồi chốt và trao thưởng một lần.
- **Bảo mật:**
  - Mật khẩu băm bằng scrypt; cookie phiên httpOnly, DB chỉ lưu SHA-256 của token.
  - WebSocket kiểm tra Origin, giới hạn tần suất.
  - Có chặn open redirect và giới hạn số lần đăng nhập sai.
  - IPN của VNPay được kiểm chữ ký và số tiền, xử lý idempotent.

## Triển khai

App là **một tiến trình Node chạy lâu dài** (Next.js + WebSocket), phù hợp với VPS, Railway, Render, Fly.io… Không chạy được trên serverless như Vercel.

- `docker compose up -d`: app kèm PostgreSQL 17. Sửa biến môi trường trong `docker-compose.yml` hoặc `.env` trước.
- Đặt sau nginx (HTTPS) thì cần chuyển tiếp WebSocket:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

## Trước khi mở cửa cho người dùng thật

1. **Pháp lý (quan trọng):**
   - Theo Nghị định 147/2024/NĐ-CP, trò chơi điện tử có nhiều người chơi cùng tương tác qua máy chủ, như cờ tướng online, là **trò chơi G1**.
   - Muốn cho người chơi nạp tiền (VIP, xu) thì cần **giấy phép cung cấp dịch vụ trò chơi G1** và **quyết định phê duyệt nội dung, kịch bản** cho từng trò chơi; ngoài ra còn các yêu cầu về đăng ký tài khoản và quản lý thời gian chơi.
   - Các trang `/dieu-khoan` và `/quyen-rieng-tu` chỉ là **bản mẫu**, cần luật sư rà soát.
   - Hãy làm việc với luật sư trước khi bật thanh toán thật.
2. **Điền thông tin của bạn:**
   - `PUBLIC_URL`, `CONTACT_EMAIL`.
   - Khóa Resend (email), Google/Facebook (đăng nhập), VNPay (thanh toán).
   - Khi đã có khóa VNPay thật: đặt `PAYMENT_PROVIDER=vnpay` và tuyệt đối **không** để `mock`.
3. **Giấy phép engine:** `pikafish.nnue` ghi rõ không được dùng thương mại khi chưa xin phép. Xin phép nhóm Pikafish, hoặc đổi sang engine có trọng số cho phép thương mại (vd. Fairy-Stockfish, trọng số cờ tướng CC0) qua `ENGINE_PATH` / `ENGINE_EVAL_FILE`.
4. **Chốt giá** trong `src/lib/products.ts`.
5. **Sao lưu PostgreSQL** định kỳ.

## Giới hạn hiện tại

- **Một máy chủ:** các ván đang diễn ra, lời mời bạn bè và hàng chờ Arena nằm trong RAM. Ván dở được khôi phục sau khi khởi động lại, nhưng lời mời và trạng thái "sẵn sàng" trong giải thì không (người chơi chỉ cần bấm lại). Muốn chạy nhiều máy chủ cần thêm Redis.
- **Luật đuổi bắt mãi** được đơn giản hóa (chưa phân biệt mọi trường hợp như luật thi đấu chính thức).
- **Cờ úp:** quân úp bị ăn khi chưa lật thì không bên nào biết là quân gì (khác với một số luật cho bên ăn được biết). AI cờ úp nông hơn AI cờ tướng.
- **Gợi ý cờ thế** được tính phí ở máy chủ, nhưng dữ liệu lời giải nằm trong mã trang (người rành kỹ thuật có thể đọc). Phần thưởng xu thì luôn được máy chủ kiểm lời giải.
#   a p p - c o - t u o n g  
 