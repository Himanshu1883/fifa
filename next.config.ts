import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** `pg` / driver adapter skip Turbopack bundling (dev “module not found” otherwise). */
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
