import type { MetadataRoute } from "next";
import { PUBLIC_URL } from "@/lib/site";

const PAGES = ["/", "/online", "/play", "/puzzle", "/leaderboard", "/tournaments", "/dieu-khoan", "/quyen-rieng-tu"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({ url: `${PUBLIC_URL}${path}`, changeFrequency: "daily", priority: path === "/" ? 1 : 0.6 }));
}
