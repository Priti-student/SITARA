import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma.js";
import { app, createOfficer, registerApplicant, unique, type Session } from "./p5.helpers.js";

describe("Phase 9 — dashboards, analytics & alert feed", () => {
  const emails = [`p9m-${unique}@example.com`, `p9n-${unique}@example.com`];
  const officerEmails = [`p9a-dept-${unique}@example.com`, `p9a-st-${unique}@example.com`];
  const applicant = { token: "" };
  const outsider = { token: "" };
  let dept: Session, state: Session;
  let unitId = "";

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    await prisma.$connect();
    applicant.token = (await registerApplicant(emails[0])).token;
    outsider.token = (await registerApplicant(emails[1])).token;
    dept = await createOfficer("DEPARTMENT_USER", "FIRE", "p9a-dept");
    state = await createOfficer("STATE_ADMIN", "INDUSTRY", "p9a-st");

    const userRow = await prisma.user.findUnique({ where: { email: emails[0] }, select: { id: true } });
    const unit = await prisma.unit.create({
      data: { name: "P9 Analytics Unit", industryType: "pharma", sector: "Pharma", state: "Maharashtra", district: "Nashik" },
    });
    await prisma.unitMember.create({ data: { unitId: unit.id, userId: userRow!.id, role: "OWNER" } });
    unitId = unit.id;
  }, 30_000);

  afterAll(async () => {
    const all = await prisma.user.findMany({ where: { email: { in: [...emails, ...officerEmails] } }, select: { id: true } });
    const userIds = all.map((u) => u.id);
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.unitMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.unit.deleteMany({ where: { members: { none: {} }, name: "P9 Analytics Unit" } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }, 30_000);

  it("returns a PLATFORM overview for officers and MINE for applicants", async () => {
    const officerView = await request(app).get("/api/v1/analytics/overview").set(auth(state.token));
    expect(officerView.status).toBe(200);
    const ov = officerView.body.data;
    expect(ov.scope).toBe("PLATFORM");
    expect(ov.kpis.units).toBeGreaterThanOrEqual(1);
    expect(ov.kpis.applications).toBeGreaterThanOrEqual(0);
    expect(ov.trend).toHaveLength(6);
    for (const t of ov.trend) expect(t).toHaveProperty("month");
    expect(ov.applications).toHaveProperty("SUBMITTED");
    expect(ov.claims).toHaveProperty("UTILISED");
    expect(ov.grievances).toHaveProperty("ESCALATED");
    expect(ov.inspections).toHaveProperty("SCHEDULED");
    expect(Array.isArray(ov.departments)).toBe(true);
    expect(ov.generatedAt).toBeTruthy();

    const myView = await request(app).get("/api/v1/analytics/overview").set(auth(applicant.token));
    expect(myView.status).toBe(200);
    const mine = myView.body.data;
    expect(mine.scope).toBe("MINE");
    expect(mine.kpis.units).toBe(1); // only their own unit
    expect(mine.departments).toHaveLength(0); // workload table is officer-only
  }, 30_000);

  it("scopes the applicant view: outsiders get an empty dashboard", async () => {
    const res = await request(app).get("/api/v1/analytics/overview").set(auth(outsider.token));
    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe("MINE");
    expect(res.body.data.kpis.units).toBe(0);
    expect(res.body.data.kpis.applications).toBe(0);
  }, 30_000);

  it("rejects unauthenticated dashboard access", async () => {
    const res = await request(app).get("/api/v1/analytics/overview");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  }, 30_000);

  it("serves a severity-ranked alert feed, scoped per role", async () => {
    const feed = await request(app).get("/api/v1/analytics/alerts").set(auth(dept.token));
    expect(feed.status).toBe(200);
    const { items, summary } = feed.body.data;
    expect(Array.isArray(items)).toBe(true);
    expect(summary.total).toBe(items.length);
    expect(summary.CRITICAL + summary.HIGH + summary.MEDIUM + summary.LOW).toBe(summary.total);
    // severity order: CRITICAL → HIGH → MEDIUM → LOW
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    for (let i = 1; i < items.length; i++) {
      expect(order[items[i].severity]).toBeGreaterThanOrEqual(order[items[i - 1].severity]);
    }
    for (const item of items) {
      expect(item.key).toBeTruthy();
      expect(item.href).toMatch(/^\//);
      expect(item.title).toBeTruthy();
    }

    // Applicant feed must not carry the platform-level SLA-breach card.
    const mine = await request(app).get("/api/v1/analytics/alerts").set(auth(applicant.token));
    expect(mine.status).toBe(200);
    const keys = (mine.body.data.items as any[]).map((i) => i.key);
    expect(keys).not.toContain("sla-breach");
  }, 30_000);

  it("surfaces escalated grievances in both the feed and the dashboard", async () => {
    // File + force-escalate a grievance, then confirm the signals.
    const filed = await request(app).post("/api/v1/grievances").set(auth(applicant.token)).send({
      subject: "Alert wiring smoke check grievance",
      description: "This grievance exists purely to validate the alert feed and dashboard wiring.",
      category: "OTHER",
      priority: "LOW",
      unitId,
    });
    expect(filed.status).toBe(201);
    const gid = filed.body.data.grievance.id;
    await prisma.grievance.update({
      where: { id: gid },
      data: { status: "ESCALATED", escalationLevel: 1, escalatedAt: new Date(), escalationReason: "test" },
    });

    try {
      const officerFeed = await request(app).get("/api/v1/analytics/alerts").set(auth(state.token));
      const gAlert = (officerFeed.body.data.items as any[]).find((i) => i.key === "grievance-escalated");
      expect(gAlert).toBeTruthy();
      expect(gAlert.severity).toBe("CRITICAL");

      const applicantFeed = await request(app).get("/api/v1/analytics/alerts").set(auth(applicant.token));
      const mineAlert = (applicantFeed.body.data.items as any[]).find((i) => i.key === "grievance-escalated");
      expect(mineAlert).toBeTruthy();
      expect(mineAlert.severity).toBe("HIGH");

      const ov = await request(app).get("/api/v1/analytics/overview").set(auth(state.token));
      expect(ov.body.data.grievances.ESCALATED).toBeGreaterThanOrEqual(1);
      expect(ov.body.data.kpis.openGrievances).toBeGreaterThanOrEqual(1);

      const myOv = await request(app).get("/api/v1/analytics/overview").set(auth(applicant.token));
      expect(myOv.body.data.grievances.ESCALATED).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.grievanceEvent.deleteMany({ where: { grievanceId: gid } });
      await prisma.grievance.deleteMany({ where: { id: gid } });
    }
  }, 30_000);

  it("caps the feed with ?limit=", async () => {
    const res = await request(app).get("/api/v1/analytics/alerts?limit=2").set(auth(dept.token));
    expect(res.status).toBe(200);
    expect((res.body.data.items as any[]).length).toBeLessThanOrEqual(2);
  }, 30_000);
});
