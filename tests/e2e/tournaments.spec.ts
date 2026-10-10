import { expect, test } from "@playwright/test";
import { register, uniq } from "./helpers";

test("giải đấu: lịch tự tạo, xem chi tiết, khách được mời tạo tài khoản, thành viên tham gia được", async ({ page }) => {
  await page.goto("/tournaments");
  await expect(page.getByRole("heading", { name: "Đấu liên tục, cộng điểm, nhận xu" })).toBeVisible();
  const first = page.getByRole("link", { name: /Arena/ }).first();
  await expect(first).toBeVisible();
  await first.click();
  await page.waitForURL(/\/tournaments\/a\d{8}[a-z]{2}$/);
  await expect(page.getByRole("heading", { level: 1, name: /Arena/ })).toBeVisible();
  await expect(page.getByRole("timer")).toContainText(/Bắt đầu sau|Còn lại|Đã hết giờ|kết thúc/);
  await expect(page.getByRole("link", { name: "Đăng nhập để tham gia" })).toBeVisible();

  const url = page.url();
  await register(page, `giai_${uniq()}`, "Kỳ Thủ Giải", new URL(url).pathname);
  const join = page.getByRole("button", { name: "Tham gia giải" });
  await join.click();
  await expect(page.getByRole("button", { name: "Tạm nghỉ" })).toBeVisible();
  // Đã vào bảng điểm.
  await expect(page.getByRole("table").getByText("Kỳ Thủ Giải")).toBeVisible();
  await page.getByRole("button", { name: "Tạm nghỉ" }).click();
  await expect(page.getByRole("button", { name: "Vào thi đấu tiếp" })).toBeVisible();
});

test("màn hình laptop nhỏ (1024px): menu không làm tràn ngang", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const path of ["/", "/tournaments", "/shop"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
