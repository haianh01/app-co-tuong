# Kỳ Đài – Cờ tướng online

Web chơi cờ tướng:
- đấu xếp hạng với người thật (WebSocket, Elo, bảng xếp hạng, hồ sơ, xem lại ván);
- chơi với máy (5 cấp độ);
- giải cờ thế.

Giao diện theo phong cách các app cờ Trung Quốc, dùng tốt trên cả máy tính và điện thoại.

> "Kỳ Đài" là tên tạm, đổi ở `src/components/SiteHeader.tsx` và `src/app/layout.tsx`.

## Chạy dự án

Cần Node.js 20 trở lên. Không cần cài PostgreSQL khi phát triển, vì app tự dùng PGlite (PostgreSQL chạy nhúng trong Node, dữ liệu lưu ở `.data/pglite`).

```bash
npm install
npm run dev        # http://localhost:3000 – Next.js + server game chung một cổng
npm test           # unit test + test tích hợp (WebSocket thật, PostgreSQL nhúng)
npm run typecheck
npm run lint
npm run build && npm start   # chạy bản production
```

`npm run dev:ui` chạy riêng Next.js (`next dev`), tiện khi chỉ sửa giao diện. Chế độ này không có WebSocket nên phần đấu online không hoạt động.

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | (trống) | Chuỗi kết nối PostgreSQL cho production. Để trống thì dùng PGlite. |
| `PGLITE_DIR` | `.data/pglite` | Thư mục dữ liệu PGlite. |
| `PORT` | `3000` | Cổng HTTP và WebSocket. |
| `ALLOWED_ORIGINS` | (trống) | Các origin khác host được phép mở WebSocket, phân cách bằng dấu phẩy. |
| `COOKIE_SECURE` | `true` khi production | Đặt `false` nếu chạy production qua HTTP thường (không khuyến khích). |

Migration trong `drizzle/` tự chạy khi khởi động. Sau khi sửa `src/server/db/schema.ts`, chạy `npm run db:generate` để sinh migration mới.

## Kiến trúc

```
server.ts                  Điểm khởi động: Next.js + server game (WebSocket /ws) trong một tiến trình
src/
  lib/xiangqi/             Lõi cờ tướng, thuần TypeScript, dùng chung client và server
    engine.ts              Bàn cờ, FEN, nước đi hợp lệ, chiếu, lộ mặt tướng, kết thúc ván
    notation.ts            Ký hiệu kiểu Việt Nam (P2-5, M8.7, Xt.3…)
    game.ts                Trạng thái ván: biên bản, đi lại, hòa, luật cấm chiếu mãi
    ai.ts, ai.worker.ts    AI (alpha-beta) chạy trong Web Worker
    puzzles.ts             Cờ thế
  lib/online/
    protocol.ts            Giao thức WebSocket (kiểu tin nhắn + kiểm tra dữ liệu từ client)
    rank.ts                Danh hiệu theo Elo (Tân thủ → Nhất…Cửu đẳng → Đại sư)
  server/                  Chỉ chạy trên server
    db/                    Schema Drizzle, kết nối PostgreSQL / PGlite
    auth.ts                Đăng ký, đăng nhập (scrypt), phiên đăng nhập
    rating.ts              Elo
    queries.ts             Truy vấn cho bảng xếp hạng, hồ sơ, xem lại ván
    game/room.ts           Một ván online: luật, đồng hồ, cầu hòa, xin thua, hủy, bỏ cuộc
    game/server.ts         WebSocket: xác thực, ghép cặp, phát trạng thái, người xem
    game/persist.ts        Lưu ván + cập nhật Elo trong một transaction
  app/
    online/                Sảnh đấu xếp hạng (tìm đối thủ)
    game/[id]/             Ván online (trực tiếp) hoặc xem lại ván đã xong (từ DB)
    leaderboard/, u/[username]/   Bảng xếp hạng, hồ sơ
    login/, register/, actions/auth.ts, api/me, api/logout
    play/, puzzle/         Chơi với máy, cờ thế
```

### Đấu online hoạt động thế nào

- **Server là trọng tài.** Mọi nước đi được kiểm tra lại bằng `lib/xiangqi` trên server, đồng hồ do server tính, client không thể gian lận.
- **Ghép cặp:** hàng đợi theo thể thức (5, 10, 20 phút). Màu quân được chia ngẫu nhiên.
- **Giai đoạn mở đầu:** đồng hồ chỉ chạy khi cả hai bên đã đi nước đầu. Bên nào không đi nước đầu trong 30 giây thì ván bị hủy, không tính điểm.
- **Mất kết nối:** rời ván (đóng tab, mất mạng) quá 60 giây thì bị xử thua. Tải lại trang hoặc quay lại kịp thì ván tiếp tục bình thường.
- **Elo:** người dưới 30 ván có K = 40, từ 30 ván trở đi K = 20. Ván và điểm được lưu trong cùng một transaction.
- **Bảo mật:**
  - Mật khẩu băm bằng scrypt. Cookie phiên là httpOnly, SameSite=Lax; DB chỉ lưu SHA-256 của token.
  - WebSocket kiểm tra Origin, giới hạn tần suất tin nhắn và kích thước gói tin.
  - Đăng nhập sai quá 10 lần trong 15 phút thì tạm khóa.

### Độ tin cậy

- **Engine:** đối chiếu với số perft chuẩn của cờ tướng (44 / 1.920 / 79.666).
- **Test tích hợp:** chạy server HTTP và WebSocket thật với hai client, đánh một ván, xin thua, rồi kiểm tra ván và Elo đã ghi đúng vào DB. Có kèm các tình huống bỏ cuộc, hủy ván và origin lạ.

## Triển khai

App là **một tiến trình Node chạy lâu dài** (Next.js + WebSocket), phù hợp với VPS, Railway, Render, Fly.io… Không chạy được trên nền tảng serverless như Vercel, vì cần giữ kết nối WebSocket.

```bash
DATABASE_URL=postgres://user:pass@host:5432/kydai npm run build
DATABASE_URL=postgres://user:pass@host:5432/kydai PORT=3000 npm start
```

Đặt sau nginx (HTTPS) thì cần chuyển tiếp WebSocket:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

## Giới hạn hiện tại

- **Chỉ chạy được một máy chủ:** các ván đang diễn ra nằm trong RAM. Khởi động lại server sẽ mất các ván dở (ván đã xong thì đã lưu). Muốn chạy nhiều máy chủ cần thêm Redis để chia sẻ trạng thái.
- **Ghép cặp đơn giản:** ai vào hàng đợi trước được ghép trước. Khi đông người nên ưu tiên ghép theo Elo gần nhau.
- **Luật lặp nước:** đã cấm chiếu mãi (trường chiếu). Luật cấm đuổi bắt mãi (trường sát) chưa có.
- **Chưa có:** chat trong ván, phòng bạn bè, cờ úp, cửa hàng và VIP (đã có bản thiết kế giao diện), quên mật khẩu, đăng nhập bằng Google hoặc Facebook.
- **Tiến độ cờ thế:** chưa lưu theo tài khoản.
