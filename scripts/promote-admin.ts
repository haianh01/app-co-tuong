// Cấp quyền quản trị: npm run admin:promote -- <tên đăng nhập> [tên khác...]
import { promoteAdmins } from "../src/server/admin";
import { getDbHandle } from "../src/server/db";

const names = process.argv.slice(2);
if (!names.length) {
  console.error("Cách dùng: npm run admin:promote -- <tên đăng nhập>");
  process.exit(1);
}
async function main() {
  const handle = await getDbHandle();
  const n = await promoteAdmins(handle.db, names);
  console.log(n ? `Đã cấp quyền quản trị cho ${n} tài khoản.` : "Không tìm thấy tài khoản nào.");
  await handle.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
