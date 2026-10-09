import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Test giao diện chạy trên server riêng (cổng 3100) với CSDL PGlite mới trong thư mục tạm,
// không đụng tới server dev hay dữ liệu thật.
//   npm run test:e2e                 build rồi chạy với Chromium của Playwright
//   PW_CHANNEL=msedge npm run test:e2e   dùng Edge/Chrome có sẵn trên máy (không cần tải trình duyệt)
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;
const PGLITE_DIR = process.env.E2E_PGLITE_DIR ?? path.join(os.tmpdir(), `kydai-e2e-${Date.now()}`);
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel } }],
  webServer: {
    command: "npx tsx server.ts",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), PGLITE_DIR, COOKIE_SECURE: "false", PAYMENT_PROVIDER: "mock" },
  },
});
