"use server";

import { revalidatePath } from "next/cache";
import { banUser, grantCoins, resolveReport, setRole, unbanUser } from "@/server/admin";
import { getCurrentUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { getGameServer } from "@/server/game/registry";

export interface AdminResult {
  ok: boolean;
  message: string;
}

const UUID = /^[0-9a-f-]{36}$/i;
const DENIED = { ok: false, message: "Bạn không có quyền quản trị." };

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

export async function adminBan(userId: string, hours: number, reason: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  if (!UUID.test(userId) || userId === admin.id) return { ok: false, message: "Người chơi không hợp lệ." };
  if (!Number.isFinite(hours) || hours <= 0) return { ok: false, message: "Thời hạn khóa không hợp lệ." };
  const until = await banUser(await getDb(), userId, hours, reason);
  await getGameServer()?.refreshUser(userId);
  revalidatePath("/admin/users");
  return { ok: true, message: `Đã khóa đến ${until.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.` };
}

export async function adminUnban(userId: string): Promise<AdminResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!UUID.test(userId)) return { ok: false, message: "Người chơi không hợp lệ." };
  await unbanUser(await getDb(), userId);
  await getGameServer()?.refreshUser(userId);
  revalidatePath("/admin/users");
  return { ok: true, message: "Đã mở khóa." };
}

export async function adminSetRole(userId: string, role: "user" | "admin"): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  if (!UUID.test(userId) || userId === admin.id) return { ok: false, message: "Không thể đổi quyền của chính mình." };
  await setRole(await getDb(), userId, role === "admin" ? "admin" : "user");
  revalidatePath("/admin/users");
  return { ok: true, message: role === "admin" ? "Đã cấp quyền quản trị." : "Đã bỏ quyền quản trị." };
}

export async function adminGrantCoins(userId: string, amount: number): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  if (!UUID.test(userId)) return { ok: false, message: "Người chơi không hợp lệ." };
  try {
    const res = await grantCoins(await getDb(), userId, Math.trunc(amount), admin.id);
    revalidatePath("/admin/users");
    return res.ok ? { ok: true, message: `Số dư mới: ${res.balance.toLocaleString("vi-VN")} xu.` } : { ok: false, message: res.error };
  } catch {
    return { ok: false, message: "Số xu không hợp lệ." };
  }
}

export async function adminResolveReport(id: number, status: "resolved" | "dismissed"): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin) return DENIED;
  await resolveReport(await getDb(), id, status === "resolved" ? "resolved" : "dismissed", admin.id);
  revalidatePath("/admin/reports");
  return { ok: true, message: status === "resolved" ? "Đã xử lý." : "Đã bỏ qua." };
}
