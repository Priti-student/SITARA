import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma.js";
import { app, createOfficer, registerApplicant, unique, type Session } from "./p5.helpers.js";

describe("Phase 9 — grievances: filing, handling & escalation", () => {
  const emails = [`p9a-${unique}@example.com`, `p9x-${unique}@example.com`];
  const officerEmails = [`p9dept-${unique}@example.com`, `p9st-${unique}@example.com`];
  const filer = { token: "" };
  const foreign = { token: "" };
  let dept: Session, state: Session;
  let unitId = "";
  let g1 = "", g2 = "", g3 = "";

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    await prisma.$connect();
    filer.token = (await registerApplicant(emails[0])).token;
    foreign.token = (await registerApplicant(emails[1])).token;
    dept = await createOfficer("DEPARTMENT_USER", "ENV", "p9dept");
    state = await createOfficer("STATE_ADMIN", "INDUSTRY", "p9st");

    const userRow = await prisma.user.findUnique({ where: { email: emails[0] }, select: { id: true } });
    const unit = await prisma.unit.create({
      data: { name: "P9 Grievance Unit", industryType: "textiles", sector: "Textiles", state: "Maharashtra", district: "Pune" },
    });
    await prisma.unitMember.create({ data: { unitId: unit.id, userId: userRow!.id, role: "OWNER" } });
    unitId = unit.id;
  }, 30_000);

  afterAll(async () => {
    const all = await prisma.user.findMany({ where: { email: { in: [...emails, ...officerEmails] } }, select: { id: true } });
    const userIds = all.map((u) => u.id);
    await prisma.grievanceEvent.deleteMany({ where: { grievance: { createdById: { in: userIds } } } });
    await prisma.grievance.deleteMany({ where: { createdById: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.unitMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.unit.deleteMany({ where: { members: { none: {} }, name: "P9 Grievance Unit" } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }, 30_000);

  it("files a grievance with a reference, priority SLA and audit event", async () => {
    const res = await request(app).post("/api/v1/grievances").set(auth(filer.token)).send({
      subject: "Consent certificate delayed beyond timeline",
      description: "The fire NOC has been pending at the district office for 45 days with no response.",
      category: "SERVICE_DELAY",
      priority: "HIGH",
      unitId,
    });
    expect(res.status).toBe(201);
    const g = res.body.data.grievance;
    expect(g.referenceNo).toMatch(/^GRV-\d{8}-[0-9A-F]{4}$/);
    expect(g.status).toBe("OPEN");
    expect(g.escalationLevel).toBe(0);
    // HIGH priority → 2-day response SLA
    const days = (new Date(g.slaDueAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(1.9);
    expect(days).toBeLessThan(2.1);
    g1 = g.id;

    const events = await prisma.grievanceEvent.findMany({ where: { grievanceId: g1 } });
    expect(events.map((e) => e.eventType)).toEqual(["GRIEVANCE_FILED"]);

    const adminNotes = await request(app).get("/api/v1/notifications").set(auth(state.token));
    expect((adminNotes.body.data.items as any[]).some((n) => n.title === "New grievance filed")).toBe(true);
  }, 30_000);

  it("refuses a foreign unit on filing and scopes the lists/detail", async () => {
    const otherUnit = await prisma.unit.create({ data: { name: "P9 Foreign Unit" } });
    try {
      const bad = await request(app).post("/api/v1/grievances").set(auth(filer.token)).send({
        subject: "Not my unit grievance",
        description: "This should 404 because the unit belongs to nobody here.",
        category: "OTHER",
        unitId: otherUnit.id,
      });
      expect(bad.status).toBe(404);

      const mine = await request(app).get("/api/v1/grievances").set(auth(filer.token));
      expect(mine.status).toBe(200);
      expect((mine.body.data.items as any[]).every((g) => g.unitId === unitId)).toBe(true);
      expect(mine.body.data.counts.OPEN).toBeGreaterThanOrEqual(1);

      const theirs = await request(app).get("/api/v1/grievances").set(auth(foreign.token));
      expect(theirs.status).toBe(200);
      expect(theirs.body.data.items).toHaveLength(0);

      const denied = await request(app).get(`/api/v1/grievances/${g1}`).set(auth(foreign.token));
      expect(denied.status).toBe(404);

      const queue = await request(app).get("/api/v1/grievances").set(auth(dept.token));
      expect(queue.status).toBe(200);
      expect((queue.body.data.items as any[]).some((g) => g.id === g1)).toBe(true);
      expect(queue.body.data.counts.total).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.grievanceEvent.deleteMany({ where: { grievance: { unitId: otherUnit.id } } });
      await prisma.grievance.deleteMany({ where: { unitId: otherUnit.id } });
      // deleteMany: a concurrent suite's teardown may already have removed
      // this memberless unit (they sweep `members: { none: {} }`).
      await prisma.unit.deleteMany({ where: { id: otherUnit.id } });
    }
  }, 30_000);

  it("enforces RBAC on handling: filers cannot acknowledge/respond/resolve", async () => {
    expect((await request(app).post(`/api/v1/grievances/${g1}/acknowledge`).set(auth(filer.token))).status).toBe(403);
    expect(
      (await request(app).post(`/api/v1/grievances/${g1}/respond`).set(auth(filer.token)).send({ notes: "self reply" })).status,
    ).toBe(403);
    expect(
      (await request(app).post(`/api/v1/grievances/${g1}/resolve`).set(auth(filer.token)).send({ accepted: true, notes: "self resolve" }))
        .status,
    ).toBe(403);
    // The officer-side sweep is also guarded
    expect((await request(app).post("/api/v1/grievances/sweep").set(auth(filer.token))).status).toBe(403);
  }, 30_000);

  it("runs the full officer lifecycle: acknowledge → respond → resolve", async () => {
    const ack = await request(app).post(`/api/v1/grievances/${g1}/acknowledge`).set(auth(dept.token));
    expect(ack.status).toBe(200);
    expect(ack.body.data.grievance.status).toBe("IN_PROGRESS");
    expect(ack.body.data.grievance.assignedToId).toBeTruthy();

    // Filer sees the acknowledgement notification
    const notes = await request(app).get("/api/v1/notifications").set(auth(filer.token));
    expect((notes.body.data.items as any[]).some((n) => n.title === "Grievance acknowledged")).toBe(true);

    const resp = await request(app)
      .post(`/api/v1/grievances/${g1}/respond`)
      .set(auth(dept.token))
      .send({ notes: "Referred to the district officer; NOC approved in-principle, hard copy by Friday." });
    expect(resp.status).toBe(200);
    expect(resp.body.data.grievance.responseNotes).toContain("district officer");
    expect(resp.body.data.grievance.respondedAt).toBeTruthy();

    const res = await request(app)
      .post(`/api/v1/grievances/${g1}/resolve`)
      .set(auth(dept.token))
      .send({ accepted: true, notes: "NOC issued and dispatched; timeline breach noted for process audit." });
    expect(res.status).toBe(200);
    expect(res.body.data.grievance.status).toBe("RESOLVED");
    expect(res.body.data.grievance.resolvedAt).toBeTruthy();

    // Re-decide → 409 BAD_STATE
    const again = await request(app)
      .post(`/api/v1/grievances/${g1}/resolve`)
      .set(auth(dept.token))
      .send({ accepted: true, notes: "double close" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("BAD_STATE");

    const notified = await request(app).get("/api/v1/notifications").set(auth(filer.token));
    expect((notified.body.data.items as any[]).some((n) => n.title === "Grievance resolved")).toBe(true);

    // Timeline order
    const detail = await request(app).get(`/api/v1/grievances/${g1}`).set(auth(dept.token));
    expect((detail.body.data.events as any[]).map((e) => e.eventType)).toEqual([
      "GRIEVANCE_FILED", "ACKNOWLEDGED", "RESPONSE_ADDED", "RESOLVED",
    ]);
    expect(detail.body.data.can).toEqual({ acknowledge: false, respond: false, resolve: false, escalate: false });
  }, 30_000);

  it("gates filer escalation on the response SLA, then allows it", async () => {
    const filed = await request(app).post("/api/v1/grievances").set(auth(filer.token)).send({
      subject: "Inspection report never uploaded to portal",
      description: "The inspection was completed a month ago but the report is still not visible on the portal.",
      category: "PROCESS_ISSUE",
      priority: "LOW",
      unitId,
    });
    expect(filed.status).toBe(201);
    g2 = filed.body.data.grievance.id;

    // Not yet past SLA → 409 SLA_NOT_MISSED
    const early = await request(app)
      .post(`/api/v1/grievances/${g2}/escalate`)
      .set(auth(filer.token))
      .send({ reason: "It has been two weeks with no response" });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("SLA_NOT_MISSED");

    // Officer can escalate regardless (routes to state admin)
    const byOfficer = await request(app)
      .post(`/api/v1/grievances/${g2}/escalate`)
      .set(auth(dept.token))
      .send({ reason: "District desk unresponsive — escalating to state level" });
    expect(byOfficer.status).toBe(200);
    expect(byOfficer.body.data.grievance.status).toBe("ESCALATED");
    expect(byOfficer.body.data.grievance.escalationLevel).toBe(1);

    const adminNotes = await request(app).get("/api/v1/notifications").set(auth(state.token));
    expect((adminNotes.body.data.items as any[]).some((n) => n.title === "Grievance escalated")).toBe(true);

    // Filer can escalate again now that it is escalated... no — SLA still not missed for filer
    const filerAgain = await request(app)
      .post(`/api/v1/grievances/${g2}/escalate`)
      .set(auth(filer.token))
      .send({ reason: "Still waiting" });
    expect(filerAgain.status).toBe(409);
    expect(filerAgain.body.error.code).toBe("SLA_NOT_MISSED");

    // Acknowledge works from ESCALATED → IN_PROGRESS
    const ack = await request(app).post(`/api/v1/grievances/${g2}/acknowledge`).set(auth(state.token));
    expect(ack.status).toBe(200);
    expect(ack.body.data.grievance.status).toBe("IN_PROGRESS");

    // Reject path closes it
    const rejected = await request(app)
      .post(`/api/v1/grievances/${g2}/resolve`)
      .set(auth(state.token))
      .send({ accepted: false, notes: "Report is downloadable under inspection history; duplicate grievance." });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.grievance.status).toBe("REJECTED");
  }, 30_000);

  it("auto-escalates overdue grievances via the sweep (idempotent)", async () => {
    // File one whose SLA already lapsed (simulated by direct date write)
    const filed = await request(app).post("/api/v1/grievances").set(auth(filer.token)).send({
      subject: "Factory licence renewal stuck with no officer",
      description: "Renewal application has been under review for 90 days without any query or approval.",
      category: "SERVICE_DELAY",
      priority: "MEDIUM",
      unitId,
    });
    expect(filed.status).toBe(201);
    g3 = filed.body.data.grievance.id;
    await prisma.grievance.update({
      where: { id: g3 },
      data: { slaDueAt: new Date(Date.now() - 3600000) },
    });

    const run1 = await request(app).post("/api/v1/grievances/sweep").set(auth(state.token));
    expect(run1.status).toBe(200);
    expect(run1.body.data.escalated).toBeGreaterThanOrEqual(1);

    const after = await prisma.grievance.findUnique({ where: { id: g3 } });
    expect(after!.status).toBe("ESCALATED");
    expect(after!.escalationLevel).toBe(1);
    expect(after!.escalationReason).toContain("auto-escalated");

    // Second run is a no-op for the same grievance (already ESCALATED)
    const run2 = await request(app).post("/api/v1/grievances/sweep").set(auth(state.token));
    const still = await prisma.grievance.findUnique({ where: { id: g3 } });
    expect(still!.escalationLevel).toBe(1);
    expect(run2.body.data.escalated).toBe(0);

    const events = await prisma.grievanceEvent.findMany({ where: { grievanceId: g3 }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.eventType)).toEqual(["GRIEVANCE_FILED", "AUTO_ESCALATED"]);

    const filerNotes = await request(app).get("/api/v1/notifications").set(auth(filer.token));
    expect((filerNotes.body.data.items as any[]).some((n) => n.title === "Grievance escalated (SLA missed)")).toBe(true);

    // The escalations are visible in the queue counts
    const queue = await request(app).get("/api/v1/grievances?status=ESCALATED").set(auth(dept.token));
    expect(queue.status).toBe(200);
    expect((queue.body.data.items as any[]).some((g) => g.id === g3)).toBe(true);
  }, 30_000);
});

