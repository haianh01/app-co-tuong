import { connection } from "next/server";
import { getDb } from "@/server/db";
import { handleVnpayIpn, vnpayConfig } from "@/server/payments";

/** VNPay gọi thẳng về máy chủ để báo kết quả thanh toán (nguồn tin cậy để cấp hàng). */
export async function GET(request: Request) {
  await connection();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  try {
    const res = await handleVnpayIpn(await getDb(), params, vnpayConfig().hashSecret);
    return Response.json(res);
  } catch (err) {
    console.error("[vnpay ipn]", err);
    return Response.json({ RspCode: "99", Message: "Unknown error" });
  }
}
