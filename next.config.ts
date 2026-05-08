import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** `pg` ships optional native bits; keep it external for server bundling. */
  serverExternalPackages: ["pg"],
};

export default nextConfig;
