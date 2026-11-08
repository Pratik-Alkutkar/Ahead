import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/ahead/:path*", destination: "/api" }];
  },
};

export default nextConfig;
