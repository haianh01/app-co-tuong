"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type AuthFormState } from "@/app/actions/auth";
import { useHydrated } from "@/hooks/useHydrated";
import { useNextParam } from "@/hooks/useLocationSearch";
import styles from "./auth.module.css";

// - Trang đăng nhập/đăng ký là trang tĩnh: `?next=` được đọc ở client nên form không bị thay
//   sau khi tải (thay form giữa chừng làm mất chữ người dùng đang gõ).
// - Nút gửi chỉ bật sau khi hydrate: gửi form kiểu HTML thuần trước lúc đó (khi bật Cache Components)
//   sẽ nhận về một trang trống.

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className={styles.fieldError}>
      {message}
    </p>
  ) : null;
}

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthFormState | undefined, FormData>(login, undefined);
  const hydrated = useHydrated();
  const next = useNextParam();
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      {state?.errors?.form && (
        <p className={styles.formError} role="alert">
          {state.errors.form}
        </p>
      )}
      <div className={styles.field}>
        <label htmlFor="username">Tên đăng nhập</label>
        <input id="username" name="username" autoComplete="username" required defaultValue={state?.values?.username} />
      </div>
      <div className={styles.field}>
        <label htmlFor="password">Mật khẩu</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending || !hydrated}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
      <p className={styles.switch}>
        <Link href="/forgot-password">Quên mật khẩu?</Link>
      </p>
      <p className={styles.switch}>
        Chưa có tài khoản? <Link href={`/register?next=${encodeURIComponent(next)}`}>Đăng ký miễn phí</Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthFormState | undefined, FormData>(register, undefined);
  const hydrated = useHydrated();
  const next = useNextParam();
  const e = state?.errors;
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <div className={styles.field}>
        <label htmlFor="username">Tên đăng nhập</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={20}
          defaultValue={state?.values?.username}
          aria-invalid={!!e?.username}
          aria-describedby="username-hint username-error"
        />
        <p id="username-hint" className={styles.hint}>3–20 ký tự: chữ không dấu, số, dấu gạch dưới. Dùng trong đường dẫn hồ sơ.</p>
        <FieldError id="username-error" message={e?.username} />
      </div>
      <div className={styles.field}>
        <label htmlFor="displayName">Tên hiển thị</label>
        <input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          required
          minLength={2}
          maxLength={32}
          defaultValue={state?.values?.displayName}
          aria-invalid={!!e?.displayName}
          aria-describedby="displayName-error"
        />
        <FieldError id="displayName-error" message={e?.displayName} />
      </div>
      <div className={styles.field}>
        <label htmlFor="password">Mật khẩu</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={!!e?.password}
          aria-describedby="password-error"
        />
        <FieldError id="password-error" message={e?.password} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending || !hydrated}>
        {pending ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
      </button>
      <p className={styles.hint}>
        Khi tạo tài khoản, bạn đồng ý với <Link href="/dieu-khoan">Điều khoản sử dụng</Link> và{" "}
        <Link href="/quyen-rieng-tu">Chính sách quyền riêng tư</Link>.
      </p>
      <p className={styles.switch}>
        Đã có tài khoản? <Link href={`/login?next=${encodeURIComponent(next)}`}>Đăng nhập</Link>
      </p>
    </form>
  );
}
