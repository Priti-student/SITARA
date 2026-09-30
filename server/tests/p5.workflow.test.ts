import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma.js";
import { app, applicantGet, createOfficer, deptView, fillAndSubmit, registerApplicant, unique, type Session } from "./p5.helpers.js";

describe("Phase 5 — department workflow engine", () => {
  const emails = [`a-${unique}@example.com`, `env-${unique}@example.com`, `fire-${unique}@example.com`, `ind-${unique}@example.com`, `ap-${unique}@example.com`, `lab-${unique}@example.com`, `st-${unique}@example.com`];
  const applicant = { token: "" };
  let env: Session, fire: Session, ind: Session, approver: Session, labour: Session, state: Session;
  let unitId = "", cte = "", fireApp = "";

  beforeAll(async () => {
    await prisma.$connect();
    applicant.token = (await registerApplicant(emails[0])).token;
    env = await createOfficer("DEPARTMENT_USER", "ENV", "env");
    fire = await createOfficer("DEPARTMENT_USER", "FIRE", "fire");
    ind = await createOfficer("DEPARTMENT_USER", "INDUSTRY", "ind");
    approver = await createOfficer("APPROVING_AUTHORITY", "ENV", "ap");
    labour = await createOfficer("DEPARTMENT_USER", "LABOUR", "lab");
    state = await createOfficer("STATE_ADMIN", "ENV", "st");

    const userRow = await prisma.user.findUnique({ where: { email: emails[0] }, select: { id: true } });
    const unit = await prisma.unit.create({
      data: { name: "P5 Pharma Unit", industryType: "pharmaceuticals", sector: "Pharmaceuticals", state: "Maharashtra", district: "Pune", employeeCount: 60, capitalInvestment: 40000000 },
    });
    await prisma.unitMember.create({ data: { unitId: unit.id, userId: userRow!.id, role: "OWNER" } });
    unitId = unit.id;
  }, 30_000);

  afterAll(async () => {
    const ids = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const userIds = ids.map((u) => u.id);
    const apps = await prisma.application.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
    if (apps.length > 0) await prisma.application.deleteMany({ where: { id: { in: apps.map((a) => a.id) } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.unitMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.unit.deleteMany({ where: { members: { none: {} } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }, 30_000);

  it("fans a CTE application into two parallel tracks and clears them via both departments", async () => {
    cte = await fillAndSubmit(applicant.token, unitId, "MPCB_CTE", "CTE");
    const view0 = await deptView(env.token, cte);
    expect(view0.workflowInstances.length).toBe(2);
    expect(view0.workflowInstances.map((i: { department: { code: string } }) => i.department.code).sort()).toEqual(["ENV", "INDUSTRY"]);
    expect(view0.status).toBe("UNDER_SCRUTINY");

    const envTrack = view0.workflowInstances.find((i: { department: { code: string } }) => i.department.code === "ENV");
    const s1 = await request(app).post(`/api/v1/department/applications/${cte}/approve`).set("Authorization", `Bearer ${env.token}`).send({ instanceId: envTrack.id, comment: "docs ok" });
    expect(s1.status).toBe(200);
    expect(s1.body.data.status).toBe("STEP_ADVANCED");

    const v1 = await deptView(env.token, cte);
    const envStep2 = v1.workflowInstances.find((i: { department: { code: string } }) => i.department.code === "ENV");
    const denied = await request(app).post(`/api/v1/department/applications/${cte}/approve`).set("Authorization", `Bearer ${env.token}`).send({ instanceId: envStep2.id });
    expect(denied.status).toBe(403);

    const s2 = await request(app).post(`/api/v1/department/applications/${cte}/approve`).set("Authorization", `Bearer ${approver.token}`).send({ instanceId: envStep2.id, comment: "approved" });
    expect(s2.status).toBe(200);

    const indTrack = (await deptView(env.token, cte)).workflowInstances.find((i: { department: { code: string } }) => i.department.code === "INDUSTRY");
    const s3 = await request(app).post(`/api/v1/department/applications/${cte}/approve`).set("Authorization", `Bearer ${ind.token}`).send({ instanceId: indTrack.id, comment: "UDYAM ok" });
    expect(s3.status).toBe(200);

    const final = await deptView(env.token, cte);
    expect(final.status).toBe("APPROVED");
    expect(final.approvals).toHaveLength(1);
    expect(final.events.filter((e: { eventType: string }) => e.eventType === "APPROVED").length).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it("runs the query → response loop on the fire track", async () => {
    fireApp = await fillAndSubmit(applicant.token, unitId, "FIRE_NOC_PROV", "FQ");
    const t = (await deptView(fire.token, fireApp)).workflowInstances[0];
    const q = await request(app).post(`/api/v1/department/applications/${fireApp}/query`).set("Authorization", `Bearer ${fire.token}`).send({ instanceId: t.id, question: "Re-upload signed drawings" });
    expect(q.status).toBe(200);
    expect((await applicantGet(applicant.token, fireApp)).status).toBe("QUERY");

    const r = await request(app).post(`/api/v1/applications/${fireApp}/query-response`).set("Authorization", `Bearer ${applicant.token}`).send({ response: "uploaded" });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe("UNDER_SCRUTINY");
    const ev = (await deptView(fire.token, fireApp)).events.map((e: { eventType: string }) => e.eventType);
    expect(ev).toContain("QUERY_RAISED");
    expect(ev).toContain("QUERY_RESPONDED");
  }, 30_000);

  it("rejects from the labour track and notifies the applicant", async () => {
    const esi = await fillAndSubmit(applicant.token, unitId, "ESI_REG", "ESI");
    const labourTrack = (await deptView(labour.token, esi)).workflowInstances[0];
    const rj = await request(app).post(`/api/v1/department/applications/${esi}/reject`).set("Authorization", `Bearer ${labour.token}`).send({ instanceId: labourTrack.id, reason: "ESI mismatch" });
    expect(rj.status).toBe(200);
    expect((await applicantGet(applicant.token, esi)).status).toBe("REJECTED");
    const notifs = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${applicant.token}`);
    expect(notifs.body.data.items.some((n: { title: string }) => n.title.toLowerCase().includes("rejected"))).toBe(true);
  }, 30_000);

  it("escalates overdue items via the SLA pass", async () => {
    fireApp = await fillAndSubmit(applicant.token, unitId, "FIRE_NOC_PROV", "SLA");
    await prisma.workflowInstance.updateMany({ where: { applicationId: fireApp }, data: { slaDueAt: new Date(Date.now() - 3600000) } });
    const run = await request(app).post("/api/v1/department/sla/run").set("Authorization", `Bearer ${state.token}`);
    expect(run.body.data.overdue).toBeGreaterThanOrEqual(1);
    const v = await deptView(fire.token, fireApp);
    expect(v.events.map((e: { eventType: string }) => e.eventType)).toContain("AUTO_ESCALATED");
    expect(v.workflowInstances.some((i: { escalatedAt: string | null }) => i.escalatedAt !== null)).toBe(true);
  }, 30_000);
});