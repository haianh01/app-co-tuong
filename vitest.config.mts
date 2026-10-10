import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Ba nhóm test. Số worker bị giới hạn để chạy test không làm máy đơ:
// - unit: logic thuần trên Node (`*.test.ts`), nhanh, chạy song song.
// - db:   cần PostgreSQL nhúng (`*.db.test.ts`). Mỗi PGlite tốn ~3 giây khởi động và ~0,5 GB RAM, nên mọi file
//         chạy tuần tự trong MỘT worker và dùng chung MỘT instance (xem src/test/db.ts).
// - ui:   component và hook React trên happy-dom (`*.test.tsx`).
// Test giao diện thật (Playwright) nằm ở tests/e2e, không chạy bằng Vitest.

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    maxWorkers: "50%",
    testTimeout: 15_000,
    hookTimeout: 30_000,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          sequence: { groupOrder: 0 },
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "src/**/*.db.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          // Chạy sau khi unit + ui xong, một worker duy nhất.
          sequence: { groupOrder: 1 },
          maxWorkers: 1,
          isolate: false,
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "happy-dom",
          sequence: { groupOrder: 0 },
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup-ui.ts"],
        },
      },
    ],
  },
});
