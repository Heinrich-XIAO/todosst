import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TEMPORARY (preview via tailnet IP) — remove after previewing
  allowedDevOrigins: ["100.72.211.48"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
