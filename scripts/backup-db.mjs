import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Lỗi: Chưa cấu hình DATABASE_URL trong .env. Không thể sao lưu CSDL PostgreSQL.");
  process.exit(1);
}

const backupDir = path.join(process.cwd(), "backups");
if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const fileName = `backup-${timestamp}.dump`;
const filePath = path.join(backupDir, fileName);

console.log(`> Đang tiến hành sao lưu CSDL vào: ${filePath}`);

const child = spawn("pg_dump", [databaseUrl, "-Fc", "-f", filePath], {
  stdio: "inherit",
});

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error("Lỗi: Không tìm thấy lệnh 'pg_dump' trên hệ thống.");
    console.error("Vui lòng cài đặt postgresql-client (trên Ubuntu/Debian: sudo apt install postgresql-client).");
  } else {
    console.error("Lỗi khi chạy pg_dump:", err.message);
  }
  process.exit(1);
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`> Sao lưu thành công: ${filePath}`);
  } else {
    console.error(`> Quá trình sao lưu thất bại với mã thoát: ${code}`);
    process.exit(code ?? 1);
  }
});
