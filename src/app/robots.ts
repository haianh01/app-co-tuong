import type { MetadataRoute } from "next";
import { PUBLIC_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/settings", "/payment/"] },
    sitemap: `${PUBLIC_URL}/sitemap.xml`,
  };
}
