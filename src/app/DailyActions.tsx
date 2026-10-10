"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { checkIn, claimMissionReward, claimVipBonus, type ActionResult } from "@/app/actions/economy";
import { useSession } from "@/components/session/SessionProvider";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "./daily.module.css";

type Props =
  | { kind: "checkin" | "vip"; state: "ready" | "claimed"; reward: number }
  | { kind: "mission"; missionId: string; state: "ready" | "claimed" | "locked" };

const LABEL = { checkin: "Điểm danh", vip: "Nhận quà VIP", mission: "Nhận" };

export function DailyActions(props: Props) {
  const hydrated = useHydrated();
  const router = useRouter();
  const { refresh } = useSession();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  if (props.state === "claimed" || result?.ok) {
    return <span className={styles.claimed}>{result?.message ?? "Đã nhận"}</span>;
  }
  if (props.kind === "mission" && props.state === "locked") return null;

  const action =
    props.kind === "mission" ? () => claimMissionReward(props.missionId) : props.kind === "vip" ? claimVipBonus : checkIn;
  const claim = () =>
    start(async () => {
      const res = await action();
      setResult(res);
      if (res.ok) {
        refresh();
        router.refresh();
      }
    });

  return (
    <>
      <button type="button" className={props.kind === "mission" ? "btn" : "btn btn-primary"} disabled={pending || !hydrated} onClick={claim}>
        {LABEL[props.kind]}
        {props.kind !== "mission" && ` +${props.reward} xu`}
      </button>
      {result && !result.ok && <span className={styles.error}>{result.message}</span>}
    </>
  );
}
