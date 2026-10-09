import { expect, test } from "@playwright/test";
import { move, sq } from "./helpers";

test("sảnh hiển thị và dẫn tới chơi với máy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bày trận, phân cao thấp." })).toBeVisible();
  await page.getByRole("link", { name: /Vào trận với máy/ }).click();
  await expect(page).toHaveURL(/\/play/);
});

test("chơi với máy: đi, máy đáp, đi lại, xin thua, ván mới", async ({ page }) => {
  await page.goto("/play?level=1&side=r&time=10");
  await move(page, sq(7, 7), sq(7, 4));
  await expect(page.getByText("2 nửa nước")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Biên bản ván đấu")).toContainText("P2-5");

  await page.getByRole("button", { name: "Đi lại" }).first().click();
  await expect(page.getByText("0 nửa nước")).toBeVisible();

  await page.getByRole("button", { name: "Xin thua" }).click();
  await expect(page.getByRole("dialog", { name: "Bạn thua" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Ván mới" }).click();
  await expect(page.getByText("Đến lượt bạn")).toBeVisible();
});

test("cầm quân Đen thì máy đi trước", async ({ page }) => {
  await page.goto("/play?level=2&side=b&time=0");
  await expect(page.getByText("1 nửa nước")).toBeVisible({ timeout: 15_000 });
});

test("cờ thế: nước sai được báo, nước đúng chiếu bí", async ({ page }) => {
  await page.goto("/puzzle");
  await move(page, sq(9, 3), sq(8, 4));
  await expect(page.getByText("Chưa chiếu bí. Thử lại nhé!")).toBeVisible();
  await expect(page.getByText("Đến lượt Đỏ. Chọn quân để bắt đầu.")).toBeVisible();
  await move(page, sq(2, 8), sq(2, 3));
  await expect(page.getByText("Chiếu bí! Giải đúng thế cờ.")).toBeVisible();
});

test.describe("điện thoại", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("không bị tràn ngang", async ({ page }) => {
    for (const path of ["/", "/play", "/puzzle", "/online", "/leaderboard", "/login"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, `tràn ngang ở ${path}`).toBe(false);
    }
  });
});
