import { expect, test } from "@playwright/test";
import { register, uniq } from "./helpers";

test("người chơi mới: điểm danh, mua VIP qua cổng giả lập, mở chương cờ thế VIP, đổi hồ sơ", async ({ page }) => {
  const name = `vip_${uniq()}`;
  await register(page, name, "Kỳ Thủ VIP", "/");

  // Trang chủ: điểm danh ngày 1 được 50 xu, bấm lại không được nữa.
  const daily = page.getByRole("region", { name: "Hôm nay" });
  await expect(daily.getByText("0 xu · Cửa hàng")).toBeVisible();
  await daily.getByRole("button", { name: "Điểm danh +50 xu" }).click();
  await expect(daily.getByText("Điểm danh ngày 1: +50 xu.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Hôm nay" }).getByText("50 xu · Cửa hàng")).toBeVisible();
  await expect(page.getByRole("button", { name: /Điểm danh/ })).toHaveCount(0);

  // Chưa VIP: chương cờ thế VIP bị khóa.
  await page.goto("/puzzle");
  await page.getByRole("button", { name: /Dành cho VIP/ }).first().click();
  await expect(page.getByRole("status")).toHaveText("Chương này dành cho thành viên VIP.");

  // Mua VIP 30 ngày qua cổng giả lập.
  await page.goto("/shop");
  const vip30 = page.locator("div").filter({ has: page.getByText("VIP 30 ngày", { exact: true }) }).last();
  await vip30.getByRole("button", { name: "Mua" }).click();
  await page.waitForURL("**/payment/mock**");
  await page.getByRole("button", { name: "Xác nhận đã thanh toán" }).click();
  await expect(page.getByRole("status")).toHaveText("Thanh toán thành công.");
  await page.getByRole("link", { name: "Về cửa hàng" }).click();
  await expect(page.getByText(/Bạn đang là VIP đến/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Lịch sử xu" }).getByText("Điểm danh")).toBeVisible();

  // Chương VIP đã mở: bàn cờ chơi được, không còn lớp khóa.
  await page.goto("/puzzle");
  await expect(page.getByRole("button", { name: /Dành cho VIP/ })).toHaveCount(0);
  await page.getByRole("heading", { name: /Sát cục 2 nước/ }).scrollIntoViewIfNeeded();
  await page.getByRole("heading", { name: /Sát cục 2 nước/ }).locator("xpath=following-sibling::button[1]").click();
  await expect(page.getByRole("status")).toHaveText("Đến lượt Đỏ. Chọn quân để bắt đầu.");
  await expect(page.getByRole("link", { name: "Xem gói VIP" })).toHaveCount(0);

  // Cài đặt: đổi tên hiển thị, hồ sơ công khai hiện tên mới và nhãn VIP.
  await page.goto("/settings");
  await page.getByLabel("Tên hiển thị").fill("Kỳ Thủ Mới");
  await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
  await expect(page.getByText("Đã lưu hồ sơ.")).toBeVisible();
  await page.goto(`/u/${name}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Kỳ Thủ Mới");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("VIP");
  await expect(page.getByText("Hội viên VIP", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Hội viên VIP", { exact: true })).toBeVisible();
});

test("trang quản trị: người thường không vào được", async ({ page }) => {
  await register(page, `thuong_${uniq()}`, "Người Thường", "/");
  await page.goto("/admin/users");
  await expect(page.getByText("Trang này chỉ dành cho quản trị viên.")).toHaveCount(1);
  await expect(page.getByText("Trang này chỉ dành cho quản trị viên.")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});
