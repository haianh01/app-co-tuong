// Thanh toán bằng tiền thật: tạo giao dịch, chuyển sang cổng thanh toán, xác nhận và cấp hàng (chỉ một lần).
// Cổng: VNPay (PAYMENT_PROVIDER=vnpay, cần VNP_TMN_CODE + VNP_HASH_SECRET) hoặc "mock" để thử khi phát triển.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { findProduct } from "@/lib/products";
import { PUBLIC_URL } from "@/lib/site";
import type { Database } from "./db";
import { payments, users } from "./db/schema";
import { addCoinsTx, extendVip } from "./economy";

export type ProviderName = "vnpay" | "mock";

export function paymentProvider(env: Record<string, string | undefined> = process.env): ProviderName | null {
  if (env.PAYMENT_PROVIDER === "vnpay" && env.VNP_TMN_CODE && env.VNP_HASH_SECRET) return "vnpay";
  if (env.PAYMENT_PROVIDER === "mock") return "mock";
  return null;
}

// ---- VNPay (giao thức 2.1.0) ----

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  payUrl: string;
}

export const vnpayConfig = (env: Record<string, string | undefined> = process.env): VnpayConfig => ({
  tmnCode: env.VNP_TMN_CODE ?? "",
  hashSecret: env.VNP_HASH_SECRET ?? "",
  payUrl: env.VNP_URL ?? "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
});

/** Chuỗi ký theo cách của VNPay: khóa sắp xếp tăng dần, giá trị mã hóa URL, dấu cách thành "+". */
export function vnpaySignData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== "vnp_SecureHash" && k !== "vnp_SecureHashType" && params[k] !== "")
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`)
    .join("&");
}

export const vnpaySign = (params: Record<string, string>, secret: string) =>
  createHmac("sha512", secret).update(Buffer.from(vnpaySignData(params), "utf-8")).digest("hex");

export function vnpayVerify(params: Record<string, string>, secret: string): boolean {
  const given = (params.vnp_SecureHash ?? "").toLowerCase();
  const expected = vnpaySign(params, secret);
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** yyyyMMddHHmmss theo giờ Việt Nam. */
function vnTime(ms: number): string {
  const d = new Date(ms + 7 * 60 * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function vnpayPaymentUrl(cfg: VnpayConfig, p: { id: string; amount: number; info: string; ip: string; now: number }): string {
  const params: Record<string, string> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: cfg.tmnCode,
    vnp_Amount: String(p.amount * 100),
    vnp_CurrCode: "VND",
    vnp_TxnRef: p.id,
    vnp_OrderInfo: p.info,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: `${PUBLIC_URL}/payment/return`,
    vnp_IpAddr: p.ip,
    vnp_CreateDate: vnTime(p.now),
    vnp_ExpireDate: vnTime(p.now + 15 * 60_000),
  };
  return `${cfg.payUrl}?${vnpaySignData(params)}&vnp_SecureHash=${vnpaySign(params, cfg.hashSecret)}`;
}

// ---- Giao dịch ----

export async function createPayment(
  db: Database,
  userId: string,
  productId: string,
  opts: { provider: ProviderName; ip?: string; now?: number },
): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }> {
  const product = findProduct(productId);
  if (!product) return { ok: false, error: "Sản phẩm không tồn tại." };
  const now = opts.now ?? Date.now();
  const id = `${now.toString(36)}${randomBytes(5).toString("hex")}`.slice(0, 24);
  await db.insert(payments).values({ id, userId, product: product.id, amount: product.amount, provider: opts.provider });
  const url =
    opts.provider === "vnpay"
      ? vnpayPaymentUrl(vnpayConfig(), { id, amount: product.amount, info: `Thanh toan ${product.id} ${id}`, ip: opts.ip ?? "127.0.0.1", now })
      : `/payment/mock?id=${id}`; // Cùng origin với trang: dùng đường dẫn tương đối, không phụ thuộc PUBLIC_URL.
  return { ok: true, id, url };
}

export type CompleteResult = "paid" | "already" | "notFound" | "amountMismatch";

/**
 * Đánh dấu giao dịch đã thanh toán và cấp hàng (VIP / xu) trong cùng transaction.
 * Gọi nhiều lần (cổng thanh toán gọi lại IPN) vẫn chỉ cấp hàng một lần.
 */
export async function completePayment(
  db: Database,
  paymentId: string,
  opts: { amount?: number; providerRef?: string; raw?: unknown; now?: number } = {},
): Promise<CompleteResult> {
  const now = opts.now ?? Date.now();
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!p) return "notFound";
    if (p.status === "paid") return "already";
    if (opts.amount !== undefined && opts.amount !== p.amount) return "amountMismatch";
    await tx
      .update(payments)
      .set({ status: "paid", paidAt: new Date(now), providerRef: opts.providerRef ?? null, raw: opts.raw ?? null })
      .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")));
    const product = findProduct(p.product);
    if (product?.kind === "vip") await extendVip(tx, p.userId, product.days ?? 30, now);
    if (product?.kind === "coins") await addCoinsTx(tx, p.userId, product.coins ?? 0, "purchase", p.id);
    return "paid";
  });
}

export async function failPayment(db: Database, paymentId: string, raw?: unknown) {
  await db.update(payments).set({ status: "failed", raw: raw ?? null }).where(and(eq(payments.id, paymentId), eq(payments.status, "pending")));
}

export async function getPayment(db: Database, id: string) {
  const [p] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return p ?? null;
}

export async function listPayments(db: Database, limit = 50) {
  return db
    .select({
      id: payments.id, product: payments.product, amount: payments.amount, provider: payments.provider, status: payments.status,
      createdAt: payments.createdAt, paidAt: payments.paidAt, username: users.username,
    })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

/** Xử lý IPN của VNPay; trả về đúng định dạng VNPay yêu cầu. */
export async function handleVnpayIpn(db: Database, params: Record<string, string>, secret: string) {
  if (!vnpayVerify(params, secret)) return { RspCode: "97", Message: "Invalid signature" };
  const id = params.vnp_TxnRef;
  const payment = await getPayment(db, id);
  if (!payment) return { RspCode: "01", Message: "Order not found" };
  if (Number(params.vnp_Amount) !== payment.amount * 100) return { RspCode: "04", Message: "Invalid amount" };
  if (payment.status !== "pending") return { RspCode: "02", Message: "Order already confirmed" };
  if (params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00") {
    await completePayment(db, id, { amount: payment.amount, providerRef: params.vnp_TransactionNo, raw: params });
  } else {
    await failPayment(db, id, params);
  }
  return { RspCode: "00", Message: "Confirm Success" };
}
