import { expect, test } from "@playwright/test";
import { move, newPlayer, sq, uniq } from "./helpers";

test("cờ úp với máy: quân úp đi theo ô xuất phát, đi xong được lật, máy đáp lại", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Cờ úp/ }).click();
  await page.waitForURL("**/play/jieqi");
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  // 30 quân úp lúc đầu.
  await expect(page.getByRole("button", { name: /Quân úp/ })).toHaveCount(30);

  // Quân úp ở ô Tốt giữa chỉ tiến được 1 ô.
  await page.locator(`[data-square="${sq(6, 4)}"]`).first().click();
  await expect(page.getByRole("button", { name: "Đi tới ô này" })).toHaveCount(1);
  await page.locator(`button[aria-label="Đi tới ô này"][data-square="${sq(5, 4)}"]`).click();

  // Quân vừa đi đã lật (không còn là quân úp) và máy đi đáp lại.
  await expect(page.locator(`[data-square="${sq(5, 4)}"]`).first()).not.toHaveAttribute("aria-label", /Quân úp/);
  await expect(page.getByText("2 nửa nước")).toBeVisible({ timeout: 15_000 });
  // Máy có thể đi quân úp (được lật) và ăn luôn một quân úp của mình (vd. pháo úp ăn qua ngòi).
  // Quy tắc: số quân úp còn lại = 30 − số quân đã lật − số quân úp bị ăn (hiện là "暗" trong ô quân đã ăn).
  const flips = await page.getByText(/\(lật /).count();
  const hiddenTaken = await page.getByText("暗", { exact: true }).count();
  expect(flips).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("button", { name: /Quân úp/ })).toHaveCount(30 - flips - hiddenTaken);
});

test("cờ úp online: hai người chọn chế độ Cờ úp, ghép cặp, thấy quân úp, đi quân được lật", async ({ browser }) => {
  const id = uniq();
  const a = await newPlayer(browser, `ua_${id}`, "Úp A");
  const b = await newPlayer(browser, `ub_${id}`, "Úp B");
  for (const p of [a, b]) {
    await p.getByRole("button", { name: "Cờ úp", exact: true }).click();
    await p.getByRole("button", { name: "Không tính điểm" }).click();
  }
  await a.getByRole("button", { name: /Tìm đối thủ · Cờ úp/ }).click();
  await expect(a.getByText(/Đang tìm đối thủ · Cờ úp/)).toBeVisible();
  await b.getByRole("button", { name: /Tìm đối thủ · Cờ úp/ }).click();
  await Promise.all([a.waitForURL("**/game/**"), b.waitForURL("**/game/**")]);
  await expect(a.getByText(/Cờ úp · 10\+0 · Giao hữu/)).toBeVisible();
  await expect(a.getByRole("button", { name: /Quân úp/ })).toHaveCount(30);

  const aIsRed = await a.getByText(/Hãy đi nước đầu/).isVisible();
  const [red, black] = aIsRed ? [a, b] : [b, a];
  await move(red, sq(7, 7), sq(7, 4)); // quân úp ở ô Pháo sang giữa
  await expect(black.getByRole("button", { name: /Quân úp/ })).toHaveCount(29);
  await expect(black.getByText(/P2-5 \(lật /)).toBeVisible();
});
