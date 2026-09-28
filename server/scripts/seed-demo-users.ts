// ───────────────────────────────────────────────────────────────
// Demo users for ROLE VERIFICATION (dev only).
// Creates one user per platform role with the SAME password,
// read exclusively from the DEMO_USER_PASSWORD env var.
// Run: npm run db:seed:demo
// ───────────────────────────────────────────────────────────────
import { RoleName, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/utils/prisma.js";

const DEMO_ROLES: RoleName[] = [
  "SUPER_ADMIN",
  "STATE_ADMIN",
  "DEPARTMENT_USER",
  "APPROVING_AUTHORITY",
  "INSPECTOR",
  "APPLICANT",
  "UNIT_USER",
];

function demoEmail(role: string): string {
  return `demo-${role.toLowerCase().replaceAll("_", "-")}@sitara.test`;
}

function demoName(role: string): string {
  return `Demo ${role.replaceAll("_", " ").toLowerCase()}`;
}

async function main(): Promise<void> {
  const password = env.DEMO_USER_PASSWORD;
  if (!password) {
    console.error("! DEMO_USER_PASSWORD is not set in server/.env");
    console.error("  Add e.g. DEMO_USER_PASSWORD=DemoPass-2026! then re-run.");
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);

  // Drop stale demo users from earlier runs so the table is deterministic
  const stale = await prisma.user.findMany({
    where: { email: { endsWith: "@sitara.test" } },
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: stale.map((u) => u.id) } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: stale.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: stale.map((u) => u.id) } } });
  }

  console.log(`Seeding one demo user per role (${stale.length} stale user(s) replaced)…`);
  console.log("────────────── credentials (all users share DEMO_USER_PASSWORD) ──────────────");
  for (const role of DEMO_ROLES) {
    const email = demoEmail(role);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          fullName: demoName(role),
          email,
          passwordHash,
          isVerified: true,
          status: UserStatus.ACTIVE,
          roles: { create: [{ role: { connect: { name: role } } }] },
        },
      });
    }
    console.log(`  ${role.padEnd(22)}  ${email}`);
  }
  console.log("──────────────────────────────────────────────────────────────────────────────");
  console.log("Next: open http://127.0.0.1:5173, sign in, then GET /api/v1/auth/me to confirm roles.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("Demo seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });