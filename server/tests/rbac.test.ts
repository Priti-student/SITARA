import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { RoleName, UserStatus } from "@prisma/client";
import { createApp } from "../src/app.js";
import { prisma } from "../src/utils/prisma.js";
import { hashPassword } from "../src/utils/password.js";

const app = createApp();
const unique = crypto.randomBytes(4).toString("hex");
const password = "RbacTest-2026!";

async function createUser(role: RoleName, suffix: string) {
  const email = `rbac-${suffix}-${unique}@example.com`;
  const passwordHash = await hashPassword(password);
  return prisma.user.create({
    data: {
      fullName: `RBAC ${suffix}`,
      email,
      passwordHash,
      isVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ role: { connect: { name: role } } }] },
    },
    include: { roles: { include: { role: true } } },
  });
}

describe("RBAC enforcement (GET /api/v1/admin/ping)", () => {
  const createdIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const admin = await createUser("SUPER_ADMIN", "admin");
    const applicant = await createUser("APPLICANT", "applicant");
    createdIds.push(admin.id, applicant.id);
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: createdIds } },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: createdIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  async function tokenFor(email: string) {
    const res = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    return res.body.data.accessToken;
  }

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/v1/admin/ping");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 for an APPLICANT (wrong role)", async () => {
    const token = await tokenFor(`rbac-applicant-${unique}@example.com`);
    const res = await request(app)
      .get("/api/v1/admin/ping")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 200 for a SUPER_ADMIN (allowed role)", async () => {
    const token = await tokenFor(`rbac-admin-${unique}@example.com`);
    const res = await request(app)
      .get("/api/v1/admin/ping")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.roles).toContain("SUPER_ADMIN");
  });
});