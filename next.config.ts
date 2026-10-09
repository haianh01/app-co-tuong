import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite nạp file WASM/dữ liệu lúc chạy, không đóng gói được.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
