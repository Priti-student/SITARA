// Prisma ORM v7 configuration.
// Connection URLs moved out of schema.prisma into this file.
// No secrets are hardcoded — everything comes from server/.env via dotenv.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});