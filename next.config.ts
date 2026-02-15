// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these server-only packages out of Next's bundler.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],

  // Ensure chromium assets (bin/brotli) are included in the server bundle on Vercel.
  outputFileTracingIncludes: {
    "*": ["node_modules/@sparticuz/chromium/**"],
  },
};

export default nextConfig;
