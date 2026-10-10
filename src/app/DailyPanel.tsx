import Link from "next/link";
import { CHECKIN_REWARDS, checkinStatus, missionProgress, VIP_DAILY_COINS, vipDailyStatus } from "@/server/economy";
import { getCurrentUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { DailyActions } from "./DailyActions";
import styles from "./daily.module.css";

/** Bảng "Hôm nay" ở trang chủ (gọi trong `<Suspense>`): điểm danh, nhiệm vụ, quà VIP. */
export async function DailyPanel() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.isGuest) {
    return (
      <section className={`card ${styles.panel}`}>
        <h2 className={styles.h2}>Hôm nay</h2>
        <p className="muted">
          Bạn đang chơi với tư cách khách. <Link href="/register" className={styles.link}>Lưu tài khoản</Link> để điểm danh nhận
          xu, làm nhiệm vụ hằng ngày và giữ lại lịch sử ván đấu.
        </p>
      </section>
    );
  }
  const db = await getDb();
  const [checkin, missions, vip] = await Promise.all([
    checkinStatus(db, user.id),
    missionProgress(db, user.id),
    vipDailyStatus(db, user.id),
  ]);
  // Ô sáng là những ngày đã nhận trong chuỗi 7 ngày hiện tại.
  const filled = checkin.claimedToday ? ((checkin.streak - 1) % 7) + 1 : checkin.streak % 7;

  return (
    <section className={`card ${styles.panel}`} aria-labelledby="daily">
      <div className={styles.head}>
        <h2 id="daily" className={styles.h2}>Hôm nay</h2>
        <Link href="/shop" className={styles.link}>{user.coins.toLocaleString("vi-VN")} xu · Cửa hàng</Link>
      </div>

      <div className={styles.block}>
        <h3 className={styles.h3}>Điểm danh 7 ngày {checkin.streak > 0 && <span className="muted">· chuỗi {checkin.streak} ngày</span>}</h3>
        <ol className={styles.days}>
          {CHECKIN_REWARDS.map((reward, i) => (
            <li key={i} className={i < filled ? styles.dayDone : i === filled && !checkin.claimedToday ? styles.dayNext : styles.day}>
              <span>Ngày {i + 1}</span>
              <strong>{reward}</strong>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.block}>
        <h3 className={styles.h3}>Nhiệm vụ hằng ngày</h3>
        <ul className={styles.missions}>
          {missions.map((m) => (
            <li key={m.id} className={styles.mission}>
              <span className={styles.missionName}>{m.name}</span>
              <progress max={m.goal} value={m.progress} aria-label={`${m.name}: ${m.progress}/${m.goal}`} />
              <span className="muted">{m.progress}/{m.goal} · +{m.reward} xu</span>
              <DailyActions kind="mission" missionId={m.id} state={m.claimed ? "claimed" : m.complete ? "ready" : "locked"} />
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.footer}>
        <DailyActions kind="checkin" state={checkin.claimedToday ? "claimed" : "ready"} reward={checkin.nextReward ?? 0} />
        {vip ? (
          <DailyActions kind="vip" state={vip.claimed ? "claimed" : "ready"} reward={VIP_DAILY_COINS} />
        ) : (
          <Link href="/shop#vip" className="btn">VIP: +{VIP_DAILY_COINS} xu mỗi ngày</Link>
        )}
      </div>
    </section>
  );
}
