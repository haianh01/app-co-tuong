"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPassword, setNewPassword, type FormResult } from "@/app/actions/account";
import { useHydrated } from "@/hooks/useHydrated";
import { useQueryParam } from "@/hooks/useLocationSearch";
import styles from "./auth.module.css";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormResult | undefined, FormData>(forgotPassword, undefined);
  const hydrated = useHydrated();
  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="email">Email đã xác nhận của tài khoản</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state?.ok && <p className={styles.formOk} role="status">{state.ok}</p>}
      {state?.error && <p className={styles.formError} role="alert">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending || !hydrated}>
        {pending ? "Đang gửi…" : "Gửi link đặt lại mật khẩu"}
      </button>
      <p className={styles.switch}>
        Chưa thêm email cho tài khoản? Liên hệ quản trị viên để được hỗ trợ. <Link href="/login">Quay lại đăng nhập</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<FormResult | undefined, FormData>(setNewPassword, undefined);
  const hydrated = useHydrated();
  const token = useQueryParam("token");
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="token" value={token} />
      <div className={styles.field}>
        <label htmlFor="password">Mật khẩu mới</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className={styles.field}>
        <label htmlFor="confirm">Nhập lại mật khẩu mới</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state?.error && <p className={styles.formError} role="alert">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending || !hydrated || !token}>
        {pending ? "Đang lưu…" : "Đặt mật khẩu mới"}
      </button>
    </form>
  );
}

/** Thông báo trên trang đăng nhập (sau khi đặt lại mật khẩu, đăng nhập Google/Facebook lỗi). */
export function LoginNotice() {
  const reset = useQueryParam("reset");
  const oauth = useQueryParam("oauth");
  if (reset === "1") return <p className={styles.formOk} role="status">Đã đặt mật khẩu mới. Hãy đăng nhập lại.</p>;
  if (oauth === "failed") return <p className={styles.formError} role="alert">Đăng nhập bằng dịch vụ ngoài không thành công, vui lòng thử lại.</p>;
  return null;
}
