"use server";

import { headers } from "next/headers";
import type { ItemKind } from "@/lib/skins";
import { getCurrentUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { buyItem, claimCheckin, claimMission, claimVipDaily, equipItem } from "@/server/economy";
import { getGameServer } from "@/server/game/registry";
import { completePayment, createPayment, getPayment, paymentProvider } from "@/server/payments";
import { buyHint, puzzleState, submitPuzzle } from "@/server/puzzles";
import { RateLimiter } from "@/server/rate-limit";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const KINDS: ItemKind[] = ["board", "piece", "frame"];
const purchaseLimit = new RateLimiter(10, 10 * 60_000);

async function member() {
  const user = await getCurrentUser();
  return user && !user.isGuest ? user : null;
}

const NEED_LOGIN = { ok: false as const, message: "Bạn cần đăng nhập bằng tài khoản thật." };

export async function checkIn(): Promise<ActionResult> {
  const user = await member();
  if (!user) return NEED_LOGIN;
  const res = await claimCheckin(await getDb(), user.id);
  return res.ok ? { ok: true, message: `Điểm danh ngày ${res.day}: +${res.reward} xu.` } : { ok: false, message: res.error };
}

export async function claimMissionReward(missionId: string): Promise<ActionResult> {
  const user = await member();
  if (!user) return NEED_LOGIN;
  const res = await claimMission(await getDb(), user.id, missionId);
  return res.ok ? { ok: true, message: "Đã nhận thưởng nhiệm vụ." } : { ok: false, message: res.error };
}

export async function claimVipBonus(): Promise<ActionResult> {
  const user = await member();
  if (!user) return NEED_LOGIN;
  const res = await claimVipDaily(await getDb(), user.id);
  return res.ok ? { ok: true, message: "Đã nhận 300 xu VIP hôm nay." } : { ok: false, message: res.error };
}

export async function buy(kind: ItemKind, id: string): Promise<ActionResult> {
  const user = await member();
  if (!user) return NEED_LOGIN;
  if (!KINDS.includes(kind)) return { ok: false, message: "Loại vật phẩm không hợp lệ." };
  const res = await buyItem(await getDb(), user.id, kind, id);
  return res.ok ? { ok: true, message: "Mua thành công." } : { ok: false, message: res.error };
}

export async function equip(kind: ItemKind, id: string): Promise<ActionResult> {
  const user = await member();
  if (!user) return NEED_LOGIN;
  if (!KINDS.includes(kind)) return { ok: false, message: "Loại vật phẩm không hợp lệ." };
  const res = await equipItem(await getDb(), user.id, kind, id);
  if (res.ok && kind === "frame") await getGameServer()?.refreshUser(user.id);
  return res.ok ? { ok: true, message: "Đã trang bị." } : { ok: false, message: res.error };
}

/** Bắt đầu thanh toán: trả về URL của cổng thanh toán để trình duyệt chuyển tới. */
export async function startPurchase(productId: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const user = await member();
  if (!user) return NEED_LOGIN;
  const provider = paymentProvider();
  if (!provider) return { ok: false, message: "Thanh toán chưa được bật trên máy chủ." };
  if (!purchaseLimit.hit(user.id)) return { ok: false, message: "Bạn thao tác quá nhiều, vui lòng thử lại sau." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";
  const res = await createPayment(await getDb(), user.id, productId, { provider, ip });
  return res.ok ? { ok: true, url: res.url } : { ok: false, message: res.error };
}

/** Chỉ dùng với cổng giả lập (PAYMENT_PROVIDER=mock): xác nhận "đã thanh toán". */
export async function confirmMockPayment(paymentId: string): Promise<ActionResult> {
  if (paymentProvider() !== "mock") return { ok: false, message: "Cổng giả lập không được bật." };
  const user = await member();
  if (!user) return NEED_LOGIN;
  const db = await getDb();
  const payment = await getPayment(db, paymentId);
  if (!payment || payment.userId !== user.id) return { ok: false, message: "Không tìm thấy giao dịch." };
  const res = await completePayment(db, paymentId);
  return res === "paid" || res === "already" ? { ok: true, message: "Thanh toán thành công." } : { ok: false, message: "Giao dịch không hợp lệ." };
}

// ---- Cờ thế ----

export type PuzzleSubmitResult = { ok: true; stars: number; reward: number } | { ok: false; message: string };

const isMove = (m: unknown): m is { from: number; to: number } =>
  !!m && typeof m === "object" && Number.isInteger((m as { from: unknown }).from) && Number.isInteger((m as { to: unknown }).to)
  && (m as { from: number }).from >= 0 && (m as { from: number }).from < 90 && (m as { to: number }).to >= 0 && (m as { to: number }).to < 90;

/** Gửi lời giải cờ thế. Khách/chưa đăng nhập thì chỉ chơi, không lưu. */
export async function submitPuzzleSolution(puzzleId: string, moves: unknown, attempts: number): Promise<PuzzleSubmitResult> {
  const user = await member();
  if (!user) return NEED_LOGIN;
  if (!Array.isArray(moves) || moves.length > 17 || !moves.every(isMove)) return { ok: false, message: "Lời giải không hợp lệ." };
  const res = await submitPuzzle(await getDb(), user.id, String(puzzleId), moves.map(({ from, to }) => ({ from, to })), Number(attempts));
  return res.ok ? { ok: true, stars: res.stars, reward: res.reward } : { ok: false, message: res.error };
}

export async function getHint(puzzleId: string): Promise<{ ok: true; charged: number; hint: string; from: number } | { ok: false; message: string }> {
  const user = await member();
  if (!user) return { ok: false, message: "Đăng nhập để dùng gợi ý (10 xu mỗi thế)." };
  const res = await buyHint(await getDb(), user.id, String(puzzleId));
  return res.ok ? res : { ok: false, message: res.error };
}

export async function loadPuzzleState(): Promise<{ stars: Record<string, number>; hints: string[] } | null> {
  const user = await member();
  return user ? puzzleState(await getDb(), user.id) : null;
}
