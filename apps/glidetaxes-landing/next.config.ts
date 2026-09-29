import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
