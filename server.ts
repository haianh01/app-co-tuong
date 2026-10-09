// Điểm khởi động: Next.js và server game (WebSocket tại /ws) chạy chung một tiến trình, một cổng.
//   npm run dev   →  tsx watch server.ts --dev
//   npm start     →  tsx server.ts            (cần `npm run build` trước)

import { createServer } from "node:http";

const dev = process.argv.includes("--dev");
// Phải đặt trước khi nạp Next.
Object.assign(process.env, { NODE_ENV: dev ? "development" : "production" });

async function main() {
  const { default: next } = await import("next");
  const { getDbHandle } = await import("./src/server/db");
  const { GameServer } = await import("./src/server/game/server");
  const { purgeExpiredSessions } = await import("./src/server/auth");

  const port = Number(process.env.PORT ?? 3000);
  const server = createServer();
  const app = next({ dev, hostname: "localhost", port, httpServer: server });
  const [dbHandle] = await Promise.all([getDbHandle(), app.prepare()]);

  const handle = app.getRequestHandler();
  server.on("request", (req, res) => {
    void handle(req, res);
  });

  const games = new GameServer({
    db: dbHandle.db,
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  });
  games.attach(server);

  // Dọn phiên đăng nhập hết hạn: lúc khởi động và mỗi 6 giờ.
  const purge = () => purgeExpiredSessions(dbHandle.db).catch((err) => console.error("Không dọn được phiên cũ", err));
  void purge();
  setInterval(purge, 6 * 60 * 60 * 1000).unref();

  server.listen(port, () => {
    const db = process.env.DATABASE_URL ? "PostgreSQL" : "PGlite (.data/pglite)";
    console.log(`> Kỳ Đài: http://localhost:${port}  ·  ${dev ? "development" : "production"}  ·  CSDL: ${db}`);
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await games.close();
    server.close();
    await dbHandle.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
