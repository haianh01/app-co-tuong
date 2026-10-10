import { expect, test } from "@playwright/test";
import { move, newPlayer, register, sq, uniq } from "./helpers";

test("đăng ký trùng tên và đăng nhập sai được báo lỗi", async ({ page }) => {
  const name = `trung_${uniq()}`;
  await register(page, name, "Người Một");
  await page.context().clearCookies();

  await page.goto("/register");
  await page.getByLabel("Tên đăng nhập").fill(name);
  await page.getByLabel("Tên hiển thị").fill("Người Hai");
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByText("Tên đăng nhập này đã có người dùng.")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Tên đăng nhập").fill(name);
  await page.getByLabel("Mật khẩu").fill("sai-mat-khau");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByText("Sai tên đăng nhập hoặc mật khẩu.")).toBeVisible();
});

test("hai người chơi: ghép cặp, đánh, tải lại, cầu hòa, xin thua, Elo, xem lại", async ({ browser }) => {
  const id = uniq();
  const a = await newPlayer(browser, `a_${id}`, "Hải Anh");
  const b = await newPlayer(browser, `b_${id}`, "Minh Đức", { width: 390, height: 844 });

  await a.getByRole("button", { name: /Tìm đối thủ/ }).click();
  await expect(a.getByText(/Đang tìm đối thủ/)).toBeVisible();
  await b.getByRole("button", { name: /Tìm đối thủ/ }).click();
  await Promise.all([a.waitForURL("**/game/**"), b.waitForURL("**/game/**")]);
  const gameUrl = a.url();

  await expect(a.getByText(/nước đầu/).first()).toBeVisible();
  const aIsRed = await a.getByText(/Hãy đi nước đầu/).isVisible();
  const [red, black] = aIsRed ? [a, b] : [b, a];

  await move(red, sq(7, 7), sq(7, 4));
  await expect(black.getByText(/Hãy đi nước đầu/)).toBeVisible();
  await move(black, sq(0, 7), sq(2, 6));
  await expect(red.getByText("Đến lượt bạn")).toBeVisible();

  // Tải lại trang giữa ván: trạng thái được khôi phục từ server.
  await red.reload();
  await expect(red.getByText("Đến lượt bạn")).toBeVisible();
  await expect(red.getByText(/2 nửa nước/)).toBeVisible();

  // Rời sang sảnh rồi vào lại.
  await black.goto("/online");
  await black.getByRole("link", { name: "Vào lại ván" }).click();
  await black.waitForURL(gameUrl);
  await expect(black.getByText("Đối thủ đang suy nghĩ…")).toBeVisible();

  // Cầu hòa → từ chối.
  await red.getByRole("button", { name: "Cầu hòa" }).click();
  await expect(black.getByText("Đối thủ đề nghị hòa.")).toBeVisible();
  await black.getByRole("button", { name: "Từ chối hòa" }).click();
  await expect(red.getByRole("button", { name: "Cầu hòa" })).toBeEnabled();

  // Xin thua (bấm hai lần để xác nhận).
  await black.getByRole("button", { name: "Xin thua" }).click();
  await black.getByRole("button", { name: "Bấm lần nữa để xin thua" }).click();
  await expect(red.getByRole("dialog", { name: "Bạn thắng!" })).toBeVisible();
  await expect(red.getByText(/Elo \+20/)).toBeVisible();
  await expect(black.getByText(/Elo −20/)).toBeVisible();

  // Bảng xếp hạng, hồ sơ, xem lại ván.
  await red.goto("/leaderboard");
  await expect(red.getByRole("link", { name: new RegExp(`@a_${id}`) })).toBeVisible();
  await expect(red.getByRole("link", { name: new RegExp(`@b_${id}`) })).toBeVisible();
  await red.goto(`/u/a_${id}`);
  await red.getByRole("link", { name: "Xem lại" }).first().click();
  await expect(red.getByText("Xem lại ván")).toBeVisible();
  await red.getByRole("button", { name: "Về đầu ván" }).click();
  await expect(red.getByText("Nước 0 / 2")).toBeVisible();
  await red.getByRole("button", { name: "Tiến một nước" }).click();
  await expect(red.getByText("Nước 1 / 2")).toBeVisible();

  // Đăng xuất.
  await b.goto("/online");
  await b.getByRole("button", { name: "Đăng xuất" }).click();
  await b.waitForURL("**/");
  await expect(b.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});

test("khách chơi thử ván giao hữu, chat nhanh, đấu lại, AI phân tích ván", async ({ browser }) => {
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto("/online");
  await guest.getByRole("button", { name: "Chơi thử không cần tài khoản" }).click();
  await expect(guest.getByRole("heading", { name: "Tìm đối thủ thật" })).toBeVisible();
  await expect(guest.getByRole("button", { name: "Tính điểm", exact: true })).toBeDisabled();

  const id = uniq();
  const host = await newPlayer(browser, `chu_${id}`, "Chủ Nhà");
  await host.getByRole("button", { name: "Không tính điểm" }).click();
  await host.getByRole("button", { name: /3\+2/ }).click();
  await host.getByRole("button", { name: /Tìm đối thủ/ }).click();
  await guest.getByRole("button", { name: /3\+2/ }).click();
  await guest.getByRole("button", { name: /Tìm đối thủ/ }).click();
  await Promise.all([host.waitForURL("**/game/**"), guest.waitForURL("**/game/**")]);
  const firstGame = host.url();

  await expect(host.getByText(/3\+2 · Giao hữu/)).toBeVisible();
  await host.getByRole("button", { name: "Chào bạn!" }).click();
  await expect(guest.getByLabel("Tin nhắn trong ván")).toContainText("Chào bạn!");

  const hostIsRed = await host.getByText(/Hãy đi nước đầu/).isVisible();
  const [red, black] = hostIsRed ? [host, guest] : [guest, host];
  await move(red, sq(7, 7), sq(7, 4));
  await expect(black.getByText(/Hãy đi nước đầu/)).toBeVisible();
  await move(black, sq(0, 7), sq(2, 6));
  await expect(red.getByText("Đến lượt bạn")).toBeVisible();
  await black.getByRole("button", { name: "Xin thua" }).click();
  await black.getByRole("button", { name: "Bấm lần nữa để xin thua" }).click();
  await expect(red.getByRole("dialog")).toContainText("Ván giao hữu");

  await red.getByRole("dialog").getByRole("button", { name: "Đấu lại" }).click();
  await black.getByRole("dialog").getByRole("button", { name: "Đồng ý đấu lại" }).click();
  await Promise.all([red.waitForURL((u) => u.href !== firstGame), black.waitForURL((u) => u.href !== firstGame)]);
  await red.getByRole("button", { name: "Hủy ván" }).click();
  await expect(red.getByRole("dialog", { name: "Ván bị hủy" })).toBeVisible();

  // Xem lại ván đầu và cho AI phân tích.
  await host.goto(firstGame);
  await expect(host.getByRole("heading", { name: "Xem lại ván" })).toHaveCount(1);
  await host.getByRole("button", { name: "Phân tích ván" }).click();
  await expect(host.getByText(/Độ chính xác Đỏ/)).toBeVisible({ timeout: 30_000 });
  await guestCtx.close();
});
