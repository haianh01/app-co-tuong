"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { buy, claimVipBonus, equip, startPurchase, type ActionResult } from "@/app/actions/economy";
import { Avatar } from "@/components/Avatar";
import { useHydrated } from "@/hooks/useHydrated";
import { USER_REFRESH_EVENT } from "@/lib/events";
import { PRODUCTS, formatVnd } from "@/lib/products";
import type { SessionUser } from "@/lib/session-types";
import { BOARD_SKINS, FRAMES, PIECE_SKINS, itemKey, type BoardSkin, type FrameItem, type ItemKind, type PieceSkin } from "@/lib/skins";
import styles from "./shop.module.css";

type AnyItem = BoardSkin | PieceSkin | FrameItem;

const TABS: { kind: ItemKind; label: string; items: AnyItem[] }[] = [
  { kind: "board", label: "Bàn cờ", items: BOARD_SKINS },
  { kind: "piece", label: "Quân cờ", items: PIECE_SKINS },
  { kind: "frame", label: "Khung avatar", items: FRAMES },
];

function Preview({ kind, item, user }: { kind: ItemKind; item: AnyItem; user: SessionUser | null }) {
  if (kind === "frame") return <Avatar avatar={user?.avatar} frame={item.id} size={88} />;
  const board = kind === "board" ? (item as BoardSkin) : BOARD_SKINS.find((b) => b.id === (user?.boardSkin ?? "go")) ?? BOARD_SKINS[0];
  const piece = kind === "piece" ? (item as PieceSkin) : PIECE_SKINS.find((p) => p.id === (user?.pieceSkin ?? "wood")) ?? PIECE_SKINS[0];
  const pc = (ch: string, red: boolean, x: number, y: number) => (
    <span
      className={styles.miniPiece}
      style={{ left: x, top: y, background: piece.face, color: red ? piece.red : piece.black, borderColor: red ? piece.red : piece.black, boxShadow: `0 2px 0 ${piece.edge}` }}
    >
      {ch}
    </span>
  );
  return (
    <div className={styles.miniBoard} style={{ background: board.board, boxShadow: `0 0 0 6px ${board.rim}` }}>
      <svg width="200" height="130" viewBox="0 0 200 130" aria-hidden="true">
        <path d="M14 14H186M14 48H186M14 82H186M14 116H186M14 14V116M57 14V116M100 14V116M143 14V116M186 14V116M57 14L143 82M143 14L57 82" fill="none" stroke={board.line} strokeWidth="1.4" />
      </svg>
      {pc("帥", true, 82, 30)}
      {pc("車", false, 125, 64)}
    </div>
  );
}

export function ShopClient({ user, owned, paymentsEnabled }: { user: SessionUser | null; owned: string[]; paymentsEnabled: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [tab, setTab] = useState<ItemKind>("board");
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const vip = !!user?.vipUntil;

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await fn();
      setMessage(res);
      if (res.ok) {
        window.dispatchEvent(new Event(USER_REFRESH_EVENT));
        router.refresh();
      }
    });

  const pay = (productId: string) =>
    start(async () => {
      const res = await startPurchase(productId);
      if (res.ok) window.location.assign(res.url);
      else setMessage({ ok: false, message: res.message });
    });

  const equipped = (kind: ItemKind) => (kind === "board" ? user?.boardSkin : kind === "piece" ? user?.pieceSkin : user?.frame);
  const current = TABS.find((t) => t.kind === tab)!;

  return (
    <div className={styles.layout}>
      <section id="vip" className={styles.vip}>
        <span className={styles.vipMark} aria-hidden="true">貴賓</span>
        <div className={styles.vipText}>
          <span className={styles.kicker}>VIP</span>
          <h1 className={styles.vipTitle}>Phân tích ván không giới hạn, 300 xu mỗi ngày.</h1>
          <ul className={styles.perks}>
            <li>AI phân tích mọi ván đấu</li>
            <li>Bàn cờ Hoàng cung + khung VIP</li>
            <li>Nhận 300 xu mỗi ngày</li>
            <li>Mở chương cờ thế dành riêng</li>
          </ul>
          {vip && (
            <p className={styles.vipStatus}>
              Bạn đang là VIP đến{" "}
              {new Date(user!.vipUntil!).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.{" "}
              <button type="button" className={styles.linkButton} disabled={pending || !hydrated} onClick={() => run(claimVipBonus)}>
                Nhận 300 xu hôm nay
              </button>
            </p>
          )}
        </div>
        <div className={styles.products}>
          {PRODUCTS.map((p) => (
            <div key={p.id} className={styles.product}>
              <strong>{p.name}</strong>
              <span className={styles.price}>{formatVnd(p.amount)}</span>
              <span className={styles.productDesc}>{p.desc}</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!user || !paymentsEnabled || pending || !hydrated}
                onClick={() => pay(p.id)}
              >
                {p.kind === "vip" && vip ? "Gia hạn" : "Mua"}
              </button>
            </div>
          ))}
        </div>
        {!paymentsEnabled && <p className={styles.notice}>Thanh toán chưa được bật trên máy chủ này.</p>}
        {!user && (
          <p className={styles.notice}>
            <Link href="/login?next=/shop">Đăng nhập</Link> để mua vật phẩm và gói VIP.
          </p>
        )}
      </section>

      <section className={styles.items} aria-labelledby="items-title">
        <div className={styles.itemsHead}>
          <h2 id="items-title" className={styles.h2}>Vật phẩm</h2>
          {user && <span className={styles.coins}>◎ {user.coins.toLocaleString("vi-VN")} xu</span>}
        </div>
        <div role="tablist" aria-label="Loại vật phẩm" className={styles.tabs}>
          {TABS.map((t) => (
            <button key={t.kind} type="button" role="tab" aria-selected={tab === t.kind} className={styles.tab} onClick={() => setTab(t.kind)}>
              {t.label}
            </button>
          ))}
        </div>
        {message && (
          <p className={message.ok ? styles.ok : styles.error} role="status">
            {message.message}
          </p>
        )}
        <div className={styles.grid}>
          {current.items.map((item) => {
            const isEquipped = equipped(tab) === item.id;
            const reward = "rewardOnly" in item && item.rewardOnly;
            const free = item.price === 0 && !item.vipOnly && !reward;
            const has = free || owned.includes(itemKey(tab, item.id)) || (item.vipOnly && vip);
            let action: ReactNode;
            if (!user) action = <span className="muted">Đăng nhập để dùng</span>;
            else if (isEquipped) action = <span className={styles.equipped}>Đang dùng</span>;
            else if (has) action = <button type="button" className="btn" disabled={pending || !hydrated} onClick={() => run(() => equip(tab, item.id))}>Dùng</button>;
            else if (item.vipOnly) action = <a href="#vip" className="btn">Chỉ dành cho VIP</a>;
            else if (reward) action = <span className="muted">Phần thưởng giải đấu / mùa giải</span>;
            else {
              action = (
                <button type="button" className="btn btn-primary" disabled={pending || !hydrated || user.coins < item.price} onClick={() => run(() => buy(tab, item.id))}>
                  {item.price.toLocaleString("vi-VN")} xu
                </button>
              );
            }
            return (
              <article key={item.id} className={styles.item} data-equipped={isEquipped || undefined}>
                <div className={styles.preview}>
                  <Preview kind={tab} item={item} user={user} />
                </div>
                <h3>{item.name}</h3>
                <p className="muted">{item.desc}</p>
                {action}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
