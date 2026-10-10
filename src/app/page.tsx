import Link from "next/link";
import { Suspense } from "react";
import { PUZZLES } from "@/lib/xiangqi/puzzles";
import { DailyPanel } from "./DailyPanel";
import { QuickStart } from "./QuickStart";
import styles from "./page.module.css";

const MODES = [
  { seal: "排位", bg: "#a3221b", title: "Đấu xếp hạng", desc: "Đấu với người thật, thắng cộng Elo, leo từ Tân thủ lên Đại sư.", href: "/online" },
  { seal: "人機", bg: "#6b4a2b", title: "Chơi với máy", desc: "5 cấp độ AI từ Tân thủ đến Đại sư, có gợi ý nước đi.", href: "/play" },
  { seal: "殘局", bg: "#5a3e6e", title: "Cờ thế · Tàn cuộc", desc: `${PUZZLES.length} thế sát cục kinh điển, hệ thống tự chấm đúng sai.`, href: "/puzzle" },
  { seal: "榜", bg: "#8a5a12", title: "Bảng xếp hạng", desc: "Những kỳ thủ có Elo cao nhất, xem hồ sơ và ván đấu của họ.", href: "/leaderboard" },
  { seal: "揭棋", bg: "#2f5d50", title: "Cờ úp", desc: "Quân úp ngẫu nhiên, lật mới biết. Mỗi ván một thế trận.", soon: true },
  { seal: "好友", bg: "#3d4f7a", title: "Phòng bạn bè", desc: "Tạo phòng riêng, gửi mã mời, tự chọn luật chơi.", soon: true },
  { seal: "比賽", bg: "#7a3b5c", title: "Giải đấu", desc: "Giải loại trực tiếp hằng ngày, thưởng xu và khung avatar.", soon: true },
];

export default function Home() {
  return (
    <main className={styles.main}>
      <section className={`card ${styles.hero}`}>
        <span className={styles.watermark} aria-hidden="true">象棋</span>
        <div className={styles.heroText}>
          <span className={styles.kicker}>CỜ TƯỚNG ONLINE</span>
          <h1 className={styles.title}>Bày trận, phân cao thấp.</h1>
          <p className="muted">
            Chơi ngay trên trình duyệt, không cần cài đặt. Đấu xếp hạng với người thật, luyện với máy, giải cờ thế.
          </p>
        </div>
        <QuickStart />
      </section>

      <Suspense fallback={null}>
        <DailyPanel />
      </Suspense>

      <section aria-labelledby="modes" className={styles.section}>
        <h2 id="modes" className={styles.h2}>Chế độ chơi</h2>
        <div className={styles.modes}>
          {MODES.map((m) => {
            const body = (
              <>
                <span className={`seal ${styles.modeSeal}`} style={{ background: m.bg }}>{m.seal}</span>
                <span className={styles.modeText}>
                  <span className={styles.modeTitle}>
                    {m.title}
                    {m.soon && <span className={styles.soon}>Sắp ra mắt</span>}
                  </span>
                  <span className="muted">{m.desc}</span>
                </span>
              </>
            );
            return m.href ? (
              <Link key={m.title} href={m.href} className={`card ${styles.mode}`}>{body}</Link>
            ) : (
              <div key={m.title} className={`card ${styles.mode} ${styles.disabled}`} aria-disabled="true">{body}</div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
