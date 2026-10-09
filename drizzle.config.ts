import { defineConfig } from "drizzle-kit";

// Chỉ dùng để sinh migration (`npm run db:generate`); app tự chạy migration khi khởi động.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
