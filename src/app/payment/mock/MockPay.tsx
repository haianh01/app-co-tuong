"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmMockPayment, type ActionResult } from "@/app/actions/economy";
import { useHydrated } from "@/hooks/useHydrated";
import { useQueryParam } from "@/hooks/useLocationSearch";
import { USER_REFRESH_EVENT } from "@/lib/events";

export function MockPay() {
  const id = useQueryParam("id");
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  if (result?.ok) {
    return (
      <>
        <p role="status">{result.message}</p>
        <Link href="/shop" className="btn btn-primary">Về cửa hàng</Link>
      </>
    );
  }
  return (
    <>
      <p className="muted">Mã giao dịch: {id || "—"}</p>
      {result && <p role="alert">{result.message}</p>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!id || pending || !hydrated}
        onClick={() =>
          start(async () => {
            const res = await confirmMockPayment(id);
            setResult(res);
            if (res.ok) window.dispatchEvent(new Event(USER_REFRESH_EVENT));
          })
        }
      >
        Xác nhận đã thanh toán
      </button>
      <Link href="/shop" className="btn">Hủy</Link>
    </>
  );
}
