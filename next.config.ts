import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local-first app backed by files on disk: every request reads fresh data, so
  // the prerender/cache features are left off.
  serverExternalPackages: ["unpdf", "mammoth"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
