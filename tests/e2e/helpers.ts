import { expect, type Browser, type Page } from "@playwright/test";

export const sq = (r: number, c: number) => r * 9 + c;

/** Hậu tố ngẫu nhiên để tên đăng nhập không trùng giữa các lần chạy. */
export const uniq = () => Math.random().toString(36).slice(2, 7);

export async function register(page: Page, username: string, displayName: string, next = "/online") {
  await page.goto(`/register?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Tên hiển thị").fill(displayName);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.waitForURL(`**${next}`);
}

/** Mở một "người chơi" mới (ngữ cảnh trình duyệt riêng, cookie riêng) đã đăng ký và vào sảnh online. */
export async function newPlayer(browser: Browser, username: string, displayName: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  await register(page, username, displayName);
  await expect(page.getByRole("heading", { name: "Tìm đối thủ thật" })).toBeVisible();
  return page;
}

/** Bấm chọn quân rồi bấm ô đích. */
export async function move(page: Page, from: number, to: number) {
  await page.locator(`[data-square="${from}"]`).first().click();
  await page.locator(`button[aria-label="Đi tới ô này"][data-square="${to}"]`).click();
}
