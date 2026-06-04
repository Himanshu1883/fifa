import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Match Next.js / scripts: .env.local first, then .env
loadEnv({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    /** Used by Prisma Migrate CLI. Set to the same DB as the app, or use a direct URL if the app uses a pooler. */
    url: env("DATABASE_URL"),
  },
});
