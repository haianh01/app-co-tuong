import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayClient } from "./PlayClient";
import { parseSettings } from "./settings";

export const metadata: Metadata = {
  title: "Chơi với máy",
};

// Khung trang được prerender; phần đọc searchParams stream vào sau.
export default function PlayPage({ searchParams }: PageProps<"/play">) {
  return (
    <Suspense fallback={<p style={{ padding: 24, textAlign: "center" }} className="muted">Đang bày bàn cờ…</p>}>
      <PlayWithSettings searchParams={searchParams} />
    </Suspense>
  );
}

async function PlayWithSettings({ searchParams }: Pick<PageProps<"/play">, "searchParams">) {
  const settings = parseSettings(await searchParams);
  return <PlayClient initial={settings} />;
}
