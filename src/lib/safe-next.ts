/**
 * Chỉ cho phép quay về đường dẫn nội bộ, tránh bị lợi dụng chuyển hướng sang trang khác (open redirect).
 * Phân tích bằng URL thật (trình duyệt bỏ qua tab/xuống dòng, coi "\" như "/"), không so chuỗi.
 */
export function safeNext(value: unknown, fallback = "/online"): string {
  const s = typeof value === "string" ? value : "";
  if (!s.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(s)) return fallback;
  const base = "http://noi-bo.invalid";
  try {
    const u = new URL(s, base);
    return u.origin === base ? `${u.pathname}${u.search}${u.hash}` : fallback;
  } catch {
    return fallback;
  }
}
