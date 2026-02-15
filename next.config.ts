// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Prevent Next from trying to bundle these into the route handler.
   * We want Node to resolve them normally at runtime.
   */
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],

  /**
   * Ensure the Chromium package files (including its bin/brotli assets)
   * are included in the serverless function bundle for the route handler.
   *
   * Keys are route globs (picomatch), values are file globs to include.
   */
  outputFileTracingIncludes: {
    "/api/render-pdf": [
      "./node_modules/@sparticuz/chromium/**",
      "./node_modules/puppeteer-core/**",
    ],
  },
};

export default nextConfig;
