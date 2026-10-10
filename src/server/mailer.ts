// Gửi email. Có RESEND_API_KEY thì gửi qua Resend (https://resend.com); không có thì ghi ra console
// (đủ để thử luồng khi phát triển). Test có thể thay bằng setMailer().

import { SITE_NAME } from "@/lib/site";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

const resendMailer: Mailer = async (mail) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM ?? `${SITE_NAME} <no-reply@example.com>`, ...mail }),
  });
  if (!res.ok) throw new Error(`Gửi email thất bại (${res.status}): ${await res.text()}`);
};

const consoleMailer: Mailer = async (mail) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Chưa cấu hình gửi email (RESEND_API_KEY).");
  }
  console.log(`\n[email] Tới: ${mail.to}\n[email] Tiêu đề: ${mail.subject}\n${mail.text}\n`);
};

const shared = globalThis as typeof globalThis & { __kydaiMailer?: Mailer };

export function setMailer(mailer: Mailer | undefined) {
  shared.__kydaiMailer = mailer;
}

export function sendMail(mail: Mail): Promise<void> {
  const mailer = shared.__kydaiMailer ?? (process.env.RESEND_API_KEY ? resendMailer : consoleMailer);
  return mailer(mail);
}

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Email đơn giản: một đoạn chữ và một nút bấm. */
export function actionMail(to: string, subject: string, intro: string, button: string, url: string, outro: string): Mail {
  return {
    to,
    subject,
    text: `${intro}\n\n${button}: ${url}\n\n${outro}\n\n— ${SITE_NAME}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">
<p>${escape(intro)}</p>
<p><a href="${escape(url)}" style="display:inline-block;padding:12px 22px;background:#c8312a;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">${escape(button)}</a></p>
<p style="color:#666">${escape(outro)}</p>
<p>— ${escape(SITE_NAME)}</p></div>`,
  };
}
