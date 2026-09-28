import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./utils/prisma.js";

async function main(): Promise<void> {
  await prisma.$connect();
  console.log("✓ Connected to PostgreSQL");

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`⚙  SITARA API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
    console.log(`   Health: GET http://localhost:${env.PORT}/api/v1/health`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});