// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these server-only packages out of the Next bundler.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],

  // Force Next to include chromium’s brotli/bin assets in the server function bundle.
  // The key "*" applies to all traced server entries.
  outputFileTracingIncludes: {
    "*": ["node_modules/@sparticuz/chromium/**"],
  },
};

export default nextConfig;
