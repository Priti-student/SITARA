import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/utils/prisma.js";

const app = createApp();
const unique = crypto.randomBytes(4).toString("hex");
const email = `rules-${unique}@example.com`;
const password = "RulesTest-2026!";

let token = "";

describe("Regulatory knowledge API", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const res = await request(app).post("/api/v1/auth/register").send({
      fullName: "Rules Tester",
      email,
      password,
      role: "APPLICANT",
    });
    token = res.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email } } });
    await prisma.userRole.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("requires authentication (401 without token)", async () => {
    const res = await request(app).get("/api/v1/rules");
    expect(res.status).toBe(401);
  });

  it("lists seeded rules with approval links", async () => {
    const res = await request(app)
      .get("/api/v1/rules")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(10);
    const mpcb = res.body.data.items.find((r: { ruleId: string }) => r.ruleId === "MH_MPCB_CTE_001");
    expect(mpcb).toBeDefined();
    expect(mpcb.approval.code).toBe("MPCB_CTE");
    expect(mpcb.approval.department).toBe("Environment & Pollution Control");
  });

  it("evaluates a pharma unit context end-to-end", async () => {
    const res = await request(app)
      .post("/api/v1/rules/evaluate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        context: {
          state: "Maharashtra",
          district: "Pune",
          industryType: "pharmaceuticals",
          establishmentType: "factory",
          employeeCount: 120,
          capitalInvestment: 75000000,
          pollution_relevant_activity: true,
          project_requires_environmental_clearance: true,
          consent_to_establish_obtained: true,
          existing_consent: true,
          building_or_industrial_activity_requires_fire_approval: true,
          clearance_type: ["environmental"],
        },
      });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.classification?.category).toBe("RED");

    const codes = data.applicableApprovals.map((a: { approvalCode: string }) => a.approvalCode);
    expect(codes).toContain("ENV_EC");
    expect(codes).toContain("MPCB_CTE");
    expect(codes).toContain("MPCB_CTO");
    expect(codes).toContain("FIRE_NOC_PROV");
    expect(codes).toContain("ESI_REG");
    expect(codes).toContain("MPCB_CTO_REN");

    const ec = data.applicableApprovals.find((a: { approvalCode: string }) => a.approvalCode === "ENV_EC");
    expect(ec.workflowNotes).toContain("Online submission available");
    expect(ec.authority).toBe("Ministry of Environment, Forest and Climate Change");

    const cto = data.applicableApprovals.find((a: { approvalCode: string }) => a.approvalCode === "MPCB_CTO_REN");
    expect(cto.renewalAlertDays).toBe(60);
    expect(cto.approvalName).toBe("Consent to Operate Renewal");
  });

  it("does not fire finals when gating flags are absent", async () => {
    const res = await request(app)
      .post("/api/v1/rules/evaluate")
      .set("Authorization", `Bearer ${token}`)
      .send({ context: { state: "Maharashtra" } });
    expect(res.status).toBe(200);
    const codes = res.body.data.applicableApprovals.map(
      (a: { approvalCode: string }) => a.approvalCode
    );
    expect(codes).not.toContain("FIRE_NOC_FINAL");
    expect(codes).not.toContain("ENV_EC");
  });

  it("lists the approval-type master catalogue", async () => {
    const res = await request(app)
      .get("/api/v1/rules/approval-types")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(6);
    expect(res.body.data.items[0].requirements).toBeDefined();
  });
});