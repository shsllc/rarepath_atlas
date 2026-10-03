import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The graph bundle is read from disk at runtime; make sure serverless deploys ship it.
  outputFileTracingIncludes: { "/**": ["./data/fixtures/**/*.json", "./data/real/cdd-real.json"] },
};

export default nextConfig;
