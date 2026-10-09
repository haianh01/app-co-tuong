import type { Metadata } from "next";
import { Be_Vietnam_Pro, Noto_Serif, Noto_Serif_SC } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const body = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const display = Noto_Serif({
  variable: "--font-noto-serif",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

// Font chữ Hán cho quân cờ: rất nặng nên không preload, trình duyệt tải theo nhu cầu.
const han = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  weight: ["900"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Kỳ Đài – Chơi cờ tướng online",
    template: "%s · Kỳ Đài",
  },
  description: "Chơi cờ tướng với máy, giải cờ thế và tàn cuộc kinh điển ngay trên trình duyệt.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${body.variable} ${display.variable} ${han.variable}`}>
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
