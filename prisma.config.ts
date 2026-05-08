import "dotenv/config";
import { defineConfig, env } from "prisma/config";

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
