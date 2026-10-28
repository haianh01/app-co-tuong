"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { removeAccount, saveEmail, savePassword, saveProfile, type FormResult } from "@/app/actions/account";
import { Avatar } from "@/components/Avatar";
import { useSession } from "@/components/session/SessionProvider";
import { useMuted, useSoundPack } from "@/hooks/useGameSounds";
import { useHydrated } from "@/hooks/useHydrated";
import { AVATARS } from "@/lib/skins";
import { previewSoundPack, SOUND_PACKS } from "@/lib/sound";
import type { SessionUser } from "@/lib/session-types";
import styles from "./settings.module.css";

function Result({ state }: { state: FormResult | undefined }) {
  if (state?.error) return <p className={styles.error} role="alert">{state.error}</p>;
  if (state?.ok) return <p className={styles.ok} role="status">{state.ok}</p>;
  return null;
}

export function SettingsClient({ user, providers }: { user: SessionUser; providers: { id: string; name: string }[] }) {
  const hydrated = useHydrated();
  const { refresh } = useSession();
  const [profile, profileAction, profilePending] = useActionState<FormResult | undefined, FormData>(saveProfile, undefined);
  const [pw, pwAction, pwPending] = useActionState<FormResult | undefined, FormData>(savePassword, undefined);
  const [mail, mailAction, mailPending] = useActionState<FormResult | undefined, FormData>(saveEmail, undefined);
  const [del, delAction, delPending] = useActionState<FormResult | undefined, FormData>(removeAccount, undefined);
  const [avatar, setAvatar] = useState(user.avatar);

  // Hồ sơ vừa lưu: cập nhật tên/avatar trên header.
  useEffect(() => {
    if (profile?.ok) refresh();
  }, [profile, refresh]);

  return (
    <div className={styles.sections}>
      <section className={`card ${styles.card}`} aria-labelledby="s-profile">
        <h2 id="s-profile">Hồ sơ</h2>
        <form action={profileAction} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="displayName">Tên hiển thị</label>
            <input id="displayName" name="displayName" defaultValue={user.displayName} minLength={2} maxLength={32} required />
          </div>
          <fieldset className={styles.avatars}>
            <legend>Avatar</legend>
            {AVATARS.map((a) => (
              <label key={a.id} className={styles.avatarOption} data-checked={avatar === a.id || undefined}>
                <input type="radio" name="avatar" value={a.id} checked={avatar === a.id} onChange={() => setAvatar(a.id)} />
                <Avatar avatar={a.id} frame={user.frame} size={44} />
              </label>
            ))}
          </fieldset>
          <Result state={profile} />
          <button type="submit" className="btn btn-primary" disabled={profilePending || !hydrated}>Lưu hồ sơ</button>
        </form>
        <p className="muted">
          Tên đăng nhập: <strong>{user.username}</strong> · <Link href={`/u/${user.username}`} className={styles.link}>Xem hồ sơ công khai</Link>
        </p>
      </section>

      <SoundSection />

      <section className={`card ${styles.card}`} aria-labelledby="s-email">
        <h2 id="s-email">Email</h2>
        <p className="muted">
          {user.email
            ? `Email hiện tại: ${user.email}${user.emailVerified ? " (đã xác nhận)" : ""}.`
            : "Chưa có email."}{" "}
          Email đã xác nhận dùng để khôi phục mật khẩu khi bạn quên. Email không hiển thị công khai.
        </p>
        <form action={mailAction} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email">{user.email ? "Email mới" : "Email"}</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <Result state={mail} />
          <button type="submit" className="btn" disabled={mailPending || !hydrated}>Gửi link xác nhận</button>
        </form>
      </section>

      <section className={`card ${styles.card}`} aria-labelledby="s-password">
        <h2 id="s-password">{user.hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"}</h2>
        <form action={pwAction} className={styles.form}>
          {user.hasPassword && (
            <div className={styles.field}>
              <label htmlFor="current">Mật khẩu hiện tại</label>
              <input id="current" name="current" type="password" autoComplete="current-password" required />
            </div>
          )}
          <div className={styles.field}>
            <label htmlFor="next">Mật khẩu mới</label>
            <input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="confirm">Nhập lại mật khẩu mới</label>
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <Result state={pw} />
          <button type="submit" className="btn" disabled={pwPending || !hydrated}>Lưu mật khẩu</button>
        </form>
      </section>

      {providers.length > 0 && (
        <section className={`card ${styles.card}`} aria-labelledby="s-oauth">
          <h2 id="s-oauth">Liên kết đăng nhập</h2>
          <p className="muted">Liên kết để đăng nhập nhanh bằng tài khoản khác.</p>
          <div className={styles.row}>
            {providers.map((p) => (
              <a key={p.id} href={`/api/auth/${p.id}?link=1`} className="btn">Liên kết {p.name}</a>
            ))}
          </div>
        </section>
      )}

      <section className={`card ${styles.card} ${styles.danger}`} aria-labelledby="s-delete">
        <h2 id="s-delete">Xóa tài khoản</h2>
        <p className="muted">
          Thông tin cá nhân, xu và vật phẩm sẽ bị xóa vĩnh viễn. Các ván đã chơi được giữ lại dưới tên &quot;Người chơi đã
          xóa&quot;. Gõ tên đăng nhập <strong>{user.username}</strong> để xác nhận.
        </p>
        <form action={delAction} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="confirm-delete">Tên đăng nhập</label>
            <input id="confirm-delete" name="confirm" autoComplete="off" required />
          </div>
          <Result state={del} />
          <button type="submit" className="btn btn-danger" disabled={delPending || !hydrated}>Xóa tài khoản vĩnh viễn</button>
        </form>
      </section>
    </div>
  );
}

/** Bộ âm thanh đi cờ: lưu trên thiết bị này và dùng cho mọi màn (chơi, cờ thế, giải đấu, Tường thuật…). */
function SoundSection() {
  const [pack, setPack] = useSoundPack();
  const [muted, setMuted] = useMuted();
  return (
    <section className={`card ${styles.card}`} aria-labelledby="s-sound">
      <h2 id="s-sound">Âm thanh đi cờ</h2>
      <p className="muted">Chọn một bộ tiếng là áp dụng ngay cho mọi màn chơi trên thiết bị này. Bấm để nghe thử.</p>
      <label className={styles.switchRow}>
        <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
        Bật âm thanh
      </label>
      <fieldset className={styles.soundPacks} disabled={muted}>
        <legend className="visually-hidden">Bộ âm thanh</legend>
        {SOUND_PACKS.map((p) => (
          <label key={p.id} className={styles.soundOption} data-checked={pack === p.id || undefined}>
            <input
              type="radio"
              name="soundPack"
              value={p.id}
              checked={pack === p.id}
              onChange={() => {
                setPack(p.id);
                previewSoundPack(p.id);
              }}
            />
            <span className={styles.soundName}>
              {p.name}
              {p.recorded && <span className={styles.soundTag}>Thu âm thật</span>}
            </span>
            <span className={styles.soundDesc}>{p.desc}</span>
            <button
              type="button"
              className={styles.soundPlay}
              aria-label={`Nghe thử ${p.name}`}
              onClick={(e) => {
                e.preventDefault();
                previewSoundPack(p.id);
              }}
            >
              ▶
            </button>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
