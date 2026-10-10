import type { Metadata } from "next";
import { Suspense } from "react";
import { toSessionUser } from "@/server/auth";
import { getCurrentUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { coinHistory, ownedItems } from "@/server/economy";
import { paymentProvider } from "@/server/payments";
import { ShopClient } from "./ShopClient";
import styles from "./shop.module.css";

export const metadata: Metadata = { title: "Cửa hàng" };

const COIN_REASON: Record<string, string> = {
  checkin: "Điểm danh", mission: "Nhiệm vụ hằng ngày", vip_daily: "Quà VIP hằng ngày", puzzle: "Giải cờ thế",
  hint: "Gợi ý cờ thế", shop: "Mua vật phẩm", purchase: "Nạp xu", season: "Thưởng mùa giải", admin: "Quản trị viên điều chỉnh",
  tournament: "Thưởng giải đấu",
};

export default function ShopPage() {
  return (
    <main className={styles.main}>
      <Suspense fallback={<p className="muted">Đang tải cửa hàng…</p>}>
        <Shop />
      </Suspense>
    </main>
  );
}

async function Shop() {
  const user = await getCurrentUser();
  const member = user && !user.isGuest ? user : null;
  const db = await getDb();
  const [owned, history] = member ? await Promise.all([ownedItems(db, member.id), coinHistory(db, member.id, 30)]) : [[], []];
  return (
    <>
      <ShopClient user={member ? toSessionUser(member) : null} owned={owned} paymentsEnabled={paymentProvider() !== null} />
      {history.length > 0 && (
        <section className={`card ${styles.history}`} aria-labelledby="coin-history">
          <h2 id="coin-history" className={styles.h2}>Lịch sử xu</h2>
          <table>
            <tbody>
              {history.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{t.createdAt.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" })}</td>
                  <td>{COIN_REASON[t.reason] ?? t.reason}</td>
                  <td className={t.amount > 0 ? styles.plus : styles.minus}>
                    {t.amount > 0 ? "+" : "−"}{Math.abs(t.amount).toLocaleString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
