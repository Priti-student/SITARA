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

/// Officers assigned to their departments (departmentId on User).
const OFFICERS: { role: RoleName; department: string }[] = [
  { role: "DEPARTMENT_USER", department: "ENV" },
  { role: "DEPARTMENT_USER", department: "FIRE" },
  { role: "DEPARTMENT_USER", department: "INDUSTRY" },
  { role: "APPROVING_AUTHORITY", department: "ENV" },
  { role: "DEPARTMENT_USER", department: "LABOUR" },
  { role: "STATE_ADMIN", department: "INDUSTRY" },
  // Phase 6 — inspectors per department for joint inspection planning
  { role: "INSPECTOR", department: "ENV" },
  { role: "INSPECTOR", department: "FIRE" },
  { role: "INSPECTOR", department: "INDUSTRY" },
  { role: "INSPECTOR", department: "LABOUR" },
];

function officerEmail(role: string, department: string): string {
  return `demo-${role.toLowerCase()}-${department.toLowerCase()}@sitara.test`;
}

function officerName(role: string, department: string): string {
  return `Demo ${department} ${role.replaceAll("_", " ").toLowerCase()}`;
}

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
    const staleIds = stale.map((u) => u.id);
    // Applications (cascade documents/workflow/events/approvals) before users
    await prisma.application.deleteMany({ where: { createdById: { in: staleIds } } });
    // Units owned by these users (cascade memberships + vault docs)
    const ownedUnits = await prisma.unit.findMany({
      where: { members: { some: { userId: { in: staleIds } } } },
      select: { id: true },
    });
    if (ownedUnits.length > 0) {
      await prisma.unit.deleteMany({ where: { id: { in: ownedUnits.map((u) => u.id) } } });
    }
    await prisma.refreshToken.deleteMany({ where: { userId: { in: staleIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: staleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: staleIds } } });
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

  // Department officers (departmentId set so dept inbox works)
  for (const off of OFFICERS) {
    const dept = await prisma.department.findUnique({ where: { code: off.department } });
    if (!dept) continue;
    const email = officerEmail(off.role, off.department);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          fullName: officerName(off.role, off.department),
          email,
          passwordHash,
          isVerified: true,
          status: UserStatus.ACTIVE,
          departmentId: dept.id,
          roles: { create: [{ role: { connect: { name: off.role } } }] },
        },
      });
    } else {
      await prisma.user.update({ where: { id: existing.id }, data: { departmentId: dept.id } });
    }
    console.log(`  ${off.role.padEnd(22)}  ${email}  (${off.department})`);
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