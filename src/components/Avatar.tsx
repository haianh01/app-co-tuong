import type { CSSProperties } from "react";
import { avatarItem, frameItem } from "@/lib/skins";
import styles from "./Avatar.module.css";

/** Avatar chữ Hán trên nền màu, kèm khung (mua ở cửa hàng hoặc nhận thưởng). */
export function Avatar({ avatar, frame, size = 48 }: { avatar?: string | null; frame?: string | null; size?: number }) {
  const a = avatarItem(avatar);
  const f = frameItem(frame);
  const style = {
    width: size,
    height: size,
    background: a.bg,
    fontSize: size * 0.5,
    borderColor: f.ring,
    boxShadow: f.ring2 === "transparent" ? undefined : `0 0 0 ${Math.max(2, size / 20)}px ${f.ring2}`,
  } as CSSProperties;
  return (
    <span className={styles.avatar} style={style} aria-hidden="true">
      {a.char}
      {f.seal && size >= 44 && (
        <span className={styles.seal} style={{ background: f.ring }}>
          {f.seal}
        </span>
      )}
    </span>
  );
}
