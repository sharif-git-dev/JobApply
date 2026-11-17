import type { NextConfig } from "next";

// Building on Vercel, or with JOBAPPLY_HOSTED=1, produces the public multi-user
// website. Anything else produces the private single-user app. See src/lib/mode.ts.
const hosted = Boolean(process.env.VERCEL || process.env.JOBAPPLY_HOSTED);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_HOSTED: hosted ? "1" : "" },
  // Every request reads fresh data, so the prerender/cache features are left off.
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
