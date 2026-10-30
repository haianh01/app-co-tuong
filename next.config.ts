import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sân khấu chạy trong OBS: badge dev của Next đè lên huy hiệu kỳ thủ và lọt lên stream.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite nạp file WASM/dữ liệu lúc chạy, không đóng gói được.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
