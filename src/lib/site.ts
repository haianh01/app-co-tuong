// Thông tin chung của trang web. Đổi tên thương hiệu ở đây và chạy lại scripts/generate-brand-assets.mjs.

export const SITE_NAME = "Kỳ Đài";

/** Địa chỉ công khai của trang (dùng cho link trong email, thanh toán, đăng nhập Google/Facebook, ảnh OG). */
export const PUBLIC_URL = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Email liên hệ hiển thị ở chân trang và trang pháp lý. */
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? "";
