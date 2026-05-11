import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** `pg` / driver adapter skip Turbopack bundling (dev “module not found” otherwise). */
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  /**
   * Next.js 16 blocks cross-origin access to dev resources (incl. HMR) by default.
   * Allow hitting the dev server via 127.0.0.1 as well as localhost.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
