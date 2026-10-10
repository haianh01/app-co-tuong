import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { insertUser, resetDb } from "@/test/db";
import type { Database } from "./db";
import { coinTransactions, payments, users } from "./db/schema";
import {
  completePayment, createPayment, handleVnpayIpn, paymentProvider, vnpayPaymentUrl, vnpaySign, vnpaySignData, vnpayVerify,
} from "./payments";

let db: Database;
const SECRET = "BI-MAT-THU";
const NOW = Date.parse("2026-10-10T10:00:00+07:00");

beforeAll(async () => {
  db = await resetDb();
});

const userRow = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

describe("chọn cổng thanh toán", () => {
  it("chỉ bật VNPay khi đủ mã merchant và khóa bí mật", () => {
    expect(paymentProvider({})).toBeNull();
    expect(paymentProvider({ PAYMENT_PROVIDER: "vnpay", VNP_TMN_CODE: "X" })).toBeNull();
    expect(paymentProvider({ PAYMENT_PROVIDER: "vnpay", VNP_TMN_CODE: "X", VNP_HASH_SECRET: "Y" })).toBe("vnpay");
    expect(paymentProvider({ PAYMENT_PROVIDER: "mock" })).toBe("mock");
  });
});

describe("chữ ký VNPay", () => {
  it("sắp xếp khóa, mã hóa giá trị, dấu cách thành +, bỏ qua trường chữ ký", () => {
    const data = vnpaySignData({ vnp_TxnRef: "A1", vnp_Amount: "4900000", vnp_OrderInfo: "Thanh toan vip30", vnp_SecureHash: "x" });
    expect(data).toBe("vnp_Amount=4900000&vnp_OrderInfo=Thanh+toan+vip30&vnp_TxnRef=A1");
  });

  it("URL thanh toán: số tiền ×100, giờ Việt Nam, chữ ký kiểm tra lại được", () => {
    const url = new URL(vnpayPaymentUrl({ tmnCode: "DEMO", hashSecret: SECRET, payUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html" },
      { id: "TX1", amount: 49_000, info: "Thanh toan vip30", ip: "1.2.3.4", now: NOW }));
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({ vnp_Amount: "4900000", vnp_TmnCode: "DEMO", vnp_CreateDate: "20261010100000", vnp_TxnRef: "TX1" });
    expect(vnpayVerify(params, SECRET)).toBe(true);
    expect(vnpayVerify({ ...params, vnp_Amount: "100" }, SECRET)).toBe(false);
  });
});

describe("giao dịch", () => {
  it("mua VIP: hoàn tất thì cộng 30 ngày; gia hạn tiếp nối từ hạn cũ; gọi lại không cấp thêm", async () => {
    const u = await insertUser(db);
    const p1 = await createPayment(db, u.id, "vip30", { provider: "mock", now: NOW });
    if (!p1.ok) throw new Error();
    expect(await completePayment(db, p1.id, { now: NOW })).toBe("paid");
    expect(await completePayment(db, p1.id, { now: NOW })).toBe("already");
    expect((await userRow(u.id)).vipUntil?.getTime()).toBe(NOW + 30 * 86_400_000);

    const p2 = await createPayment(db, u.id, "vip30", { provider: "mock", now: NOW + 1000 });
    if (!p2.ok) throw new Error();
    await completePayment(db, p2.id, { now: NOW + 1000 });
    expect((await userRow(u.id)).vipUntil?.getTime()).toBe(NOW + 60 * 86_400_000);
  });

  it("mua xu: cộng đúng số xu, có dòng sổ cái; số tiền không khớp thì từ chối", async () => {
    const u = await insertUser(db);
    const p = await createPayment(db, u.id, "coins5k", { provider: "mock", now: NOW });
    if (!p.ok) throw new Error();
    expect(await completePayment(db, p.id, { amount: 1 })).toBe("amountMismatch");
    expect(await completePayment(db, p.id, { amount: 20_000 })).toBe("paid");
    expect((await userRow(u.id)).coins).toBe(5000);
    const ledger = await db.select().from(coinTransactions).where(eq(coinTransactions.userId, u.id));
    expect(ledger).toMatchObject([{ amount: 5000, reason: "purchase", ref: p.id }]);
    expect(await createPayment(db, u.id, "khong-co", { provider: "mock" })).toMatchObject({ ok: false });
  });

  it("IPN VNPay: sai chữ ký, sai số tiền, thành công, gọi lại; thất bại thì đánh dấu failed", async () => {
    const u = await insertUser(db);
    const p = await createPayment(db, u.id, "coins30k", { provider: "mock", now: NOW });
    if (!p.ok) throw new Error();
    const base = { vnp_TxnRef: p.id, vnp_Amount: "9900000", vnp_ResponseCode: "00", vnp_TransactionStatus: "00", vnp_TransactionNo: "1404" };
    const signed = (x: Record<string, string>) => ({ ...x, vnp_SecureHash: vnpaySign(x, SECRET) });

    expect(await handleVnpayIpn(db, { ...base, vnp_SecureHash: "gia-mao" }, SECRET)).toEqual({ RspCode: "97", Message: "Invalid signature" });
    expect(await handleVnpayIpn(db, signed({ ...base, vnp_Amount: "100" }), SECRET)).toMatchObject({ RspCode: "04" });
    expect(await handleVnpayIpn(db, signed(base), SECRET)).toEqual({ RspCode: "00", Message: "Confirm Success" });
    expect(await handleVnpayIpn(db, signed(base), SECRET)).toMatchObject({ RspCode: "02" });
    expect((await userRow(u.id)).coins).toBe(30_000);

    const q = await createPayment(db, u.id, "vip30", { provider: "mock", now: NOW });
    if (!q.ok) throw new Error();
    const failed = signed({ vnp_TxnRef: q.id, vnp_Amount: "4900000", vnp_ResponseCode: "24", vnp_TransactionStatus: "02" });
    expect(await handleVnpayIpn(db, failed, SECRET)).toMatchObject({ RspCode: "00" });
    expect((await db.select().from(payments).where(eq(payments.id, q.id)))[0].status).toBe("failed");
    expect((await userRow(u.id)).vipUntil).toBeNull();
  });
});
