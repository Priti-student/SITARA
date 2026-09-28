import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/utils/prisma.js";

const app = createApp();
const unique = crypto.randomBytes(4).toString("hex");
const email = `test-${unique}@example.com`;
const password = "TestPass-2026!";

describe("Auth flow", () => {
  let accessToken = "";
  let refreshToken = "";

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up the test user + session rows
    await prisma.refreshToken.deleteMany({
      where: { user: { email } },
    });
    await prisma.userRole.deleteMany({
      where: { user: { email } },
    });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("registers a new applicant account", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      fullName: "Test Applicant",
      email,
      password,
      phone: "9876543210",
      role: "APPLICANT",
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it("rejects duplicate registration", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      fullName: "Duplicate",
      email,
      password,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACCOUNT_EXISTS");
  });

  it("rejects weak passwords", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      fullName: "Weak",
      email: `weak-${unique}@example.com`,
      password: "123",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email,
      password,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.roles).toContain("APPLICANT");
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it("rejects wrong password", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "WrongPass-9999",
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns the profile for a valid token (/me)", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
  });

  it("rejects /me without a token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("refreshes the token pair and rotates the refresh token", async () => {
    const oldToken = refreshToken;
    const res = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: oldToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    refreshToken = res.body.data.refreshToken;

    // The rotated-out OLD token must now be revoked
    const replay = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: oldToken,
    });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("logs out and revokes the refresh token", async () => {
    const res = await request(app).post("/api/v1/auth/logout").send({
      refreshToken,
    });
    expect(res.status).toBe(200);

    const replay = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken,
    });
    expect(replay.status).toBe(401);
  });
});