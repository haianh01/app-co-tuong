// Đặt lại mật khẩu: npm run user:reset-password -- <tên đăng nhập> <mật khẩu mới>
import { eq } from "drizzle-orm";
import { hashPassword, normalizeUsername } from "../src/server/auth";
import { getDbHandle } from "../src/server/db";
import { users } from "../src/server/db/schema";

const [username, newPassword] = process.argv.slice(2);
if (!username || !newPassword) {
  console.error("Cách dùng: npm run user:reset-password -- <tên đăng nhập> <mật khẩu mới>");
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error("Mật khẩu phải có ít nhất 6 ký tự.");
  process.exit(1);
}

async function main() {
  const handle = await getDbHandle();
  const normalized = normalizeUsername(username);
  const hash = await hashPassword(newPassword);
  const [res] = await handle.db
    .update(users)
    .set({ passwordHash: hash })
    .where(eq(users.username, normalized))
    .returning({ id: users.id, username: users.username, displayName: users.displayName });

  if (res) {
    console.log(`Đã đổi mật khẩu thành công cho tài khoản "${res.username}" (${res.displayName}).`);
  } else {
    console.error(`Không tìm thấy tài khoản có username: "${username}".`);
  }
  await handle.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
