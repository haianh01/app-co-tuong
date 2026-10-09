import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Noto_Serif, Noto_Serif_SC } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SessionProvider } from "@/components/session/SessionProvider";
import { PUBLIC_URL, SITE_NAME } from "@/lib/site";
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

const description = "Chơi cờ tướng online miễn phí: đấu xếp hạng với người thật, chơi với máy 5 cấp độ, giải cờ thế kinh điển.";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_URL),
  title: {
    default: `${SITE_NAME} – Chơi cờ tướng online`,
    template: `%s · ${SITE_NAME}`,
  },
  description,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: SITE_NAME,
    title: `${SITE_NAME} – Chơi cờ tướng online`,
    description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${SITE_NAME} – Cờ tướng online` }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#16110e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${body.variable} ${display.variable} ${han.variable}`}>
      <body>
        <SessionProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </SessionProvider>
      </body>
    </html>
  );
}
