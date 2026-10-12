# Kỳ Đài (App Cờ Tướng) – Project Knowledge & Architectural Rules

## 1. Tổng quan dự án
- **Tên dự án**: Kỳ Đài (Cờ tướng online Việt Nam).
- **Mục tiêu**: Nền tảng cờ tướng & cờ úp trực tuyến đầy đủ tính năng: đấu người thật (Elo, Arena, phòng bạn bè), đấu máy (5 cấp độ), AI phân tích ván đấu, giải cờ thế, hệ thống kinh tế (xu, VIP, skin, nhiệm vụ), thanh toán VNPay.
- **Tên thương hiệu, config site**: `src/lib/site.ts`.

## 2. Kiến trúc & Công nghệ
- **Môi trường & Runtime**: Node.js 20+, chạy tiến trình duy nhất `server.ts` kết hợp:
  - Next.js 16 (App Router) phục vụ web giao diện & API routes.
  - WebSocket Server (`/ws`) xử lý game realtime (ghép cặp, đấu phòng, truyền nước đi, đồng hồ).
  - Khởi động: `npm run dev` (`tsx watch server.ts --dev`), production: `npm run build && npm start`.
  - **Lưu ý quan trọng**: Không thể deploy dạng serverless (như Vercel) vì có WebSocket stateful trong RAM và background tasks. Phù hợp deploy VPS, Docker, Railway, Render.
- **Database & ORM**:
  - Drizzle ORM (`drizzle-orm`, `drizzle-kit`).
  - Môi trường dev/test: Dùng PGlite (PostgreSQL nhúng lưu tại `.data/pglite`), không bắt buộc cài Postgres ngoài.
  - Production: Kết nối PostgreSQL thật qua biến môi trường `DATABASE_URL`.
  - Schema tại `src/server/db/schema.ts`. Khi sửa schema, chạy `npm run db:generate`.
- **Engine Cờ Tướng (Pikafish)**:
  - Cấp Tân thủ & Dễ: AI JavaScript thuần trong Web Worker (`src/lib/xiangqi/ai.ts`, `jieqi-ai.ts`).
  - Cấp Trung bình, Khó, Đại sư & Phân tích ván: Engine Pikafish UCI (`engine/pikafish-windows.exe` hoặc `pikafish-linux` + `pikafish.nnue`) qua `/api/engine` và `src/server/engine/uci.ts`.

## 3. Cấu trúc thư mục cốt lõi
- `server.ts`: Entry point tích hợp Next.js + WebSocket game server + cron dọn session/trao thưởng mùa.
- `src/lib/xiangqi/`: Bộ lõi luật cờ tướng thuần TypeScript (chạy chung Client & Server):
  - `engine.ts`: Bàn cờ 90 ô (10x9), sinh nước đi hợp lệ, kiểm tra chiếu/chiếu bí, FEN.
  - `game.ts`: Game state machine, biên bản nước đi, hòa cờ, luật cấm chiếu mãi / đuổi bắt mãi.
  - `notation.ts`: Ký hiệu cờ tướng Việt Nam (P2-5, M8.7...).
  - `ai.ts`, `analysis.ts`: AI alpha-beta, phân tích sai lầm (blunder, mistake, inaccuracy).
  - `jieqi.ts`, `jieqi-ai.ts`: Luật cờ úp và AI cờ úp.
  - `mate.ts`, `puzzles.ts`: Thuật toán tìm sát cục, kiểm tra cờ thế.
  - `openings.ts`: Nhận diện khai cuộc (Thuận Pháo, Nghịch Pháo, Bình Phong Mã...).
- `src/lib/online/`:
  - `protocol.ts`: Schema & parser thông điệp WebSocket client - server (mọi dữ liệu từ client đều được validate chặt chẽ).
- `src/server/`: Backend server logic:
  - `db/`: Schema Drizzle và kết nối PostgreSQL / PGlite.
  - `auth.ts`, `account.ts`, `oauth.ts`: Quản lý tài khoản, mật khẩu scrypt, session SHA-256 cookie.
  - `economy.ts`, `payments.ts`: Hệ thống xu, giao dịch an toàn (idempotent), VIP, VNPay.
  - `tournaments.ts`: Giải đấu Arena tự động, tính điểm chuỗi thắng.
  - `game/server.ts`, `room.ts`, `jieqi-room.ts`: Phòng chơi online, server làm trọng tài tính giờ và xác thực nước đi.
  - `game/persist.ts`: Lưu trữ ván đấu và cập nhật Elo nguyên tử (transaction), tự khôi phục ván dở khi restart.
- `src/app/`: Next.js App Router:
  - `/play`: Chơi với máy, Live Coach phân tích nước đi trực tiếp, phân tích ván đấu.
  - `/online`: Đấu online người thật, ghép cặp, phòng bạn bè.
  - `/puzzle`: Giải cờ thế hàng ngày & VIP.
  - `/tournaments`: Giải đấu Arena hàng ngày.
  - `/shop`, `/leaderboard`, `/settings`, `/admin`: Cửa hàng skin, bảng xếp hạng, quản trị.
- `src/components/`:
  - `board/XiangqiBoard.tsx`: Bàn cờ hiển thị SVG / tương tác click chọn nước đi, lật bàn cờ theo phe Đỏ/Đen.

## 4. Kiểm thử (Testing Guidelines)
- Chạy toàn bộ test: `npm test`
- Chạy unit + UI: `npm run test:unit`
- Chạy test database: `npm run test:db` (chạy tuần tự 1 worker vì PGlite cần khởi động riêng)
- E2E Playwright: `npm run test:e2e`
- Chú ý: Luôn giữ các test case xanh khi thêm mới hoặc refactor tính năng.

## 5. Phong cách & Ngôn ngữ
- Toàn bộ giao diện sử dụng tiếng Việt tự nhiên, chuẩn mực thuật ngữ cờ tướng Việt Nam (Đỏ, Đen, Tướng, Sĩ, Tượng, Xe, Pháo, Mã, Tốt/Binh, Chiếu tướng, Sát cục, Khai cuộc...).
- Thiết kế thẩm mỹ Á Đông sang trọng (phông chữ Noto Serif, Be Vietnam Pro, màu gỗ trầm mun `#16110e`, nhấn vàng kim `#d9a441` và đỏ triện `#c8312a`).
