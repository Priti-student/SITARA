import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/utils/prisma.js";

const app = createApp();
const unique = crypto.randomBytes(4).toString("hex");

const owners = {
  a: { email: `p3a-${unique}@example.com`, password: "P3TestPass-2026!" },
  b: { email: `p3b-${unique}@example.com`, password: "P3TestPass-2026!" },
};

type Session = { token: string };

async function registerUser(u: { email: string; password: string }): Promise<Session> {
  const res = await request(app).post("/api/v1/auth/register").send({
    fullName: `P3 User ${u.email}`,
    email: u.email,
    password: u.password,
    role: "APPLICANT",
  });
  expect(res.status).toBe(201);
  return { token: res.body.data.accessToken };
}

const PHARMA_CONTEXT = {
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
};

describe("Phase 3 — units, checklists, notifications", () => {
  let a: Session;
  let b: Session;
  let unitId = "";
  let checklistId = "";
  let itemId = "";
  const createdChecklistIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    a = await registerUser(owners.a);
    b = await registerUser(owners.b);
  });

  afterAll(async () => {
    const emails = [owners.a.email, owners.b.email];
    const ids = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const userIds = ids.map((u) => u.id);
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.checklistItem.deleteMany({ where: { checklistId: { in: createdChecklistIds } } });
    await prisma.checklist.deleteMany({ where: { id: { in: createdChecklistIds } } });
    await prisma.unitMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.unit.deleteMany({ where: { members: { none: {} } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("creates a unit for user A", async () => {
    const res = await request(app)
      .post("/api/v1/units")
      .set("Authorization", `Bearer ${a.token}`)
      .send({
        name: "P3 Pharma Pvt Ltd",
        industryType: "pharmaceuticals",
        sector: "Pharma",
        establishmentType: "factory",
        state: "Maharashtra",
        district: "Pune",
        employeeCount: 120,
        capitalInvestment: 75000000,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.unit.name).toBe("P3 Pharma Pvt Ltd");
    expect(res.body.data.unit.members[0].role).toBe("OWNER");
    unitId = res.body.data.unit.id;
  });

  it("lists only my units", async () => {
    const resA = await request(app).get("/api/v1/units").set("Authorization", `Bearer ${a.token}`);
    const resB = await request(app).get("/api/v1/units").set("Authorization", `Bearer ${b.token}`);
    expect(resA.body.data.items.length).toBe(1);
    expect(resB.body.data.items.length).toBe(0);
  });

  it("evaluates without persisting via /checklists/preview", async () => {
    const res = await request(app)
      .post("/api/v1/checklists/preview")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ context: PHARMA_CONTEXT });
    expect(res.status).toBe(200);
    expect(res.body.data.classification.category).toBe("RED");
    expect(res.body.data.applicableApprovals.length).toBeGreaterThanOrEqual(6);
  });

  it("persists a checklist, links items, and creates a notification", async () => {
    const res = await request(app)
      .post("/api/v1/checklists")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ unitId, name: "Pune pharma pre-establishment", context: PHARMA_CONTEXT });
    expect(res.status).toBe(201);
    const cl = res.body.data.checklist;
    expect(cl.name).toBe("Pune pharma pre-establishment");
    expect(cl.riskCategory).toBe("RED");
    expect(cl.items.length).toBeGreaterThanOrEqual(6);
    checklistId = cl.id;
    createdChecklistIds.push(checklistId);
    itemId = cl.items[0].id;

    const notifs = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${a.token}`);
    expect(notifs.status).toBe(200);
    expect(notifs.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    expect(notifs.body.data.items[0].type).toBe("CHECKLIST_READY");
  });

it("lists my checklists and rejects cross-owner access", async () => {
    const mine = await request(app)
      .get("/api/v1/checklists")
      .set("Authorization", `Bearer ${a.token}`);
    expect(mine.body.data.items.length).toBe(1);

    const other = await request(app)
      .get(`/api/v1/checklists/${checklistId}`)
      .set("Authorization", `Bearer ${b.token}`);
    expect(other.status).toBe(404);
  });

  it("returns checklist detail with labelled documents grouped by stage", async () => {
    const res = await request(app)
      .get(`/api/v1/checklists/${checklistId}`)
      .set("Authorization", `Bearer ${a.token}`);
    expect(res.status).toBe(200);
    const cl = res.body.data.checklist;
    expect(cl.items.length).toBeGreaterThanOrEqual(6);
    const ec = cl.items.find((i: { approvalType: { code: string } }) => i.approvalType.code === "ENV_EC");
    expect(ec).toBeDefined();
    expect(ec.approvalType.authority.name).toContain("Environment");
    expect(ec.documents.length).toBeGreaterThanOrEqual(1);
    expect(typeof ec.documents[0].name).toBe("string");
    const stages = cl.items.map((i: { approvalType: { stage: string } }) => i.approvalType.stage);
    expect(stages).toContain("pre_establishment");
    expect(stages).toContain("pre_operation");
  });

  it("updates an item status (applicant marking applied)", async () => {
    const res = await request(app)
      .patch(`/api/v1/checklists/${checklistId}/items/${itemId}`)
      .set("Authorization", `Bearer ${a.token}`)
      .send({ status: "APPLIED" });
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/checklists/${checklistId}`)
      .set("Authorization", `Bearer ${a.token}`);
    expect(detail.body.data.checklist.items[0].status).toBe("APPLIED");
  });

  it("marks notifications as read", async () => {
    const before = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${a.token}`);
    const id = before.body.data.items[0].id;

    const single = await request(app)
      .post(`/api/v1/notifications/${id}/read`)
      .set("Authorization", `Bearer ${a.token}`);
    expect(single.status).toBe(200);

    const after = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${a.token}`);
    expect(after.body.data.unreadCount).toBe(0);
  });

  it("rejects invalid checklist item status", async () => {
    const res = await request(app)
      .patch(`/api/v1/checklists/${checklistId}/items/${itemId}`)
      .set("Authorization", `Bearer ${a.token}`)
      .send({ status: "NONSENSE" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});