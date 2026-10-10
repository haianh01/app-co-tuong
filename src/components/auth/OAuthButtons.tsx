import { connection } from "next/server";
import { oauthProviders } from "@/server/oauth";
import styles from "./auth.module.css";

/** Nút đăng nhập bằng Google/Facebook (chỉ hiện dịch vụ đã cấu hình). Đặt trong `<Suspense>`. */
export async function OAuthButtons() {
  await connection();
  const providers = oauthProviders();
  if (!providers.length) return null;
  return (
    <div className={styles.oauth}>
      <span className={styles.or}>hoặc</span>
      {providers.map((p) => (
        <a key={p.id} href={`/api/auth/${p.id}`} className="btn">
          Tiếp tục với {p.name}
        </a>
      ))}
    </div>
  );
}
