import { RoleName, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/utils/prisma.js";
import { seedMasterData } from "./seed-master-data.js";
import { seedIncentives } from "./seed-incentives.js";

const ROLES: { name: RoleName; description: string }[] = [
  { name: "SUPER_ADMIN", description: "Platform administrator with full control" },
  { name: "STATE_ADMIN", description: "State-level administrator: dashboards, escalations, grievance routing" },
  { name: "DEPARTMENT_USER", description: "Department officer: scrutiny, queries, approvals" },
  { name: "APPROVING_AUTHORITY", description: "Final sign-off authority (digital-signature placeholder)" },
  { name: "INSPECTOR", description: "Inspection officer: schedules, checklists, reports" },
  { name: "APPLICANT", description: "Entrepreneur / industrial unit applicant" },
  { name: "UNIT_USER", description: "Member of an industrial unit account" },
];

async function main(): Promise<void> {
  // 1) Roles
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
  console.log(`✓ Seeded ${ROLES.length} roles`);

  // 1b) Master data: departments, authorities, approval types, document types, rules
  await seedMasterData();

  // 1c) Incentive schemes catalogue (Phase 8)
  await seedIncentives();

  // 2) Bootstrap super admin (credentials come ONLY from environment variables)
  const adminEmail = env.ADMIN_EMAIL;
  const adminPassword = env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const passwordHash = await hashPassword(adminPassword);
    const existing = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() } });
    const adminRole = await prisma.role.findUnique({ where: { name: "SUPER_ADMIN" } });

    if (!existing && adminRole) {
      await prisma.user.create({
        data: {
          fullName: "SITARA Platform Admin",
          email: adminEmail.toLowerCase(),
          passwordHash,
          isVerified: true,
          status: UserStatus.ACTIVE,
          roles: {
            create: [{ role: { connect: { name: "SUPER_ADMIN" } } }],
          },
        },
      });
      console.log(`✓ Bootstrap super admin created: ${adminEmail}`);
    } else if (existing && adminRole) {
      // .env may have changed — refresh the password hash and ensure the role
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, isVerified: true },
      });
      await prisma.userRole.createMany({
        data: [{ userId: existing.id, roleId: adminRole.id }],
        skipDuplicates: true,
      });
      console.log(`✓ Super admin credentials refreshed from .env: ${adminEmail}`);
    }
  } else {
    console.log("! ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping bootstrap admin.");
    console.log("  Set them in server/.env and re-run: npm run db:seed");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });