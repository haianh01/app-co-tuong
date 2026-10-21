/**
 * Cuộn biên bản tới nước đang xem, CHỈ trong khung biên bản. Không dùng `scrollIntoView`: hàm đó cuộn cả mọi khung
 * cha lẫn trang, làm trang Tường thuật giật mỗi khi có nước mới. Không có nước đang chọn thì cuộn xuống cuối.
 */
export function scrollMoveIntoBox(box: HTMLElement | null, active: HTMLElement | null) {
  if (!box) return;
  if (!active) {
    box.scrollTop = box.scrollHeight;
    return;
  }
  const b = box.getBoundingClientRect();
  const r = active.getBoundingClientRect();
  const delta = r.top < b.top ? r.top - b.top : r.bottom > b.bottom ? r.bottom - b.bottom : 0;
  if (delta) box.scrollBy({ top: delta, behavior: "smooth" });
}
