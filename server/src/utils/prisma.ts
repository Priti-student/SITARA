import "dotenv/config"; // ensure server/.env is loaded for standalone entry points (seed, tests)
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma ORM v7 requires a driver adapter for PostgreSQL.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set. Check server/.env");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });

// Single PrismaClient instance shared across the app.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}