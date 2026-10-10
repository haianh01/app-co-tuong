import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { searchUsers } from "@/server/admin";
import { getDb } from "@/server/db";
import { AdminGate, AdminNav } from "../AdminGate";
import { UserActions } from "./UserActions";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "Quản trị · Người chơi" };

const fmt = (d: Date | null) => (d ? d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }) : "");

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Người chơi</h1>
      <AdminNav current="users" />
      <Suspense fallback={<p className="muted">Đang tải…</p>}>
        <AdminGate>{(adminId) => <Users searchParams={searchParams} adminId={adminId} />}</AdminGate>
      </Suspense>
    </main>
  );
}

async function Users({ searchParams, adminId }: Pick<PageProps<"/admin/users">, "searchParams"> & { adminId: string }) {
  const { q } = await searchParams;
  await connection();
  const query = typeof q === "string" ? q : "";
  const rows = await searchUsers(await getDb(), query);
  const now = new Date();
  return (
    <>
      <form className={styles.search} role="search">
        <label htmlFor="q" className="visually-hidden">Tìm người chơi</label>
        <input id="q" name="q" defaultValue={query} placeholder="Tên đăng nhập, tên hiển thị hoặc email" />
        <button type="submit" className="btn">Tìm</button>
      </form>
      <div className={`card ${styles.tableCard}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Người chơi</th>
              <th scope="col">Elo / Ván</th>
              <th scope="col">Xu</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const banned = !!u.bannedUntil && u.bannedUntil > now;
              return (
                <tr key={u.id}>
                  <td>
                    <Link href={`/u/${u.username}`} className={styles.link}>{u.displayName}</Link>
                    <div className="muted">@{u.username}{u.email ? ` · ${u.email}` : ""}</div>
                  </td>
                  <td>{u.rating} / {u.gamesPlayed}</td>
                  <td>{u.coins.toLocaleString("vi-VN")}</td>
                  <td>
                    {u.role === "admin" && <span className={styles.tag}>Quản trị</span>}
                    {u.isGuest && <span className={styles.tag}>Khách</span>}
                    {banned && <span className={styles.tagDanger}>Khóa đến {fmt(u.bannedUntil)}{u.banReason ? ` · ${u.banReason}` : ""}</span>}
                  </td>
                  <td>
                    {u.id === adminId ? <span className="muted">(bạn)</span> : <UserActions userId={u.id} banned={banned} admin={u.role === "admin"} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">Không tìm thấy ai.</p>}
      </div>
    </>
  );
}
