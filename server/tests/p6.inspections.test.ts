import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma.js";
import { app, createOfficer, registerApplicant, unique, type Session } from "./p5.helpers.js";

/** Pharma context mirroring Phase 3 (classification rule → RED). */
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

/** Fills documents + form and submits an already-created (draft) application. */
async function finishAndSubmit(token: string, appId: string, prefix: string) {
  const detail = await request(app)
    .get(`/api/v1/applications/${appId}`)
    .set("Authorization", `Bearer ${token}`);
  const reqs = detail.body.data.application.approvalType.requirements;
  for (const r of reqs) {
    const up = await request(app)
      .post(`/api/v1/applications/${appId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(`%PDF ${prefix} ${r.documentType.code}`), `${r.documentType.code}.pdf`)
      .field("documentType", r.documentType.code);
    if (up.status !== 201) throw new Error(`upload ${r.documentType.code} -> ${up.status}`);
  }
  const formData: Record<string, unknown> = {};
  for (const f of detail.body.data.application.approvalType.formSchema) {
    if (f.required) formData[f.key] = f.type === "number" ? 5000 : f.options ? f.options[0] : "VALUE";
  }
  const form = await request(app)
    .put(`/api/v1/applications/${appId}/form`)
    .set("Authorization", `Bearer ${token}`)
    .send({ formData });
  if (form.status !== 200) throw new Error(`form -> ${form.status}`);
  const submit = await request(app)
    .post(`/api/v1/applications/${appId}/submit`)
    .set("Authorization", `Bearer ${token}`);
  if (submit.status !== 200) throw new Error(`submit -> ${submit.status}`);
  return appId;
}

async function createDraft(token: string, unitId: string, approvalCode: string, checklistItemId?: string) {
  const res = await request(app)
    .post("/api/v1/applications")
    .set("Authorization", `Bearer ${token}`)
    .send({ unitId, approvalTypeCode: approvalCode, ...(checklistItemId ? { checklistItemId } : {}) });
  if (res.status !== 201) throw new Error(`create -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.application.id as string;
}

async function getRisk(token: string, appId: string) {
  return request(app).get(`/api/v1/inspections/risk/${appId}`).set("Authorization", `Bearer ${token}`);
}

describe("Phase 6 — risk-based scrutiny & joint inspections", () => {
  const emails = [`a6-${unique}@example.com`];
  const applicant = { token: "" };
  let env: Session, state: Session;
  let inspEnv: Session, inspInd: Session, inspFire: Session;
  let unitLow = "", unitHigh = "", lowApp = "", highApp = "";
  let inspectionId = "", envParticipantId = "", indParticipantId = "";
  let highScore = 0;

  beforeAll(async () => {
    await prisma.$connect();
    applicant.token = (await registerApplicant(emails[0])).token;
    env = await createOfficer("DEPARTMENT_USER", "ENV", `p6env-${unique}`);
    state = await createOfficer("STATE_ADMIN", "INDUSTRY", `p6st-${unique}`);
    inspEnv = await createOfficer("INSPECTOR", "ENV", `p6ie-${unique}`);
    inspInd = await createOfficer("INSPECTOR", "INDUSTRY", `p6ii-${unique}`);
    inspFire = await createOfficer("INSPECTOR", "FIRE", `p6if-${unique}`);

    const userRow = await prisma.user.findUnique({ where: { email: emails[0] }, select: { id: true } });
    const modest = await prisma.unit.create({
      data: { name: "P6 Modest Unit", industryType: "textile", sector: "Textiles", state: "Maharashtra", district: "Nashik", employeeCount: 20, capitalInvestment: 4000000 },
    });
    const big = await prisma.unit.create({
      data: { name: "P6 Pharma Unit", industryType: "pharmaceuticals", sector: "Pharmaceuticals", state: "Maharashtra", district: "Pune", employeeCount: 120, capitalInvestment: 150000000 },
    });
    await prisma.unitMember.createMany({
      data: [
        { unitId: modest.id, userId: userRow!.id, role: "OWNER" },
        { unitId: big.id, userId: userRow!.id, role: "OWNER" },
      ],
    });
    unitLow = modest.id;
    unitHigh = big.id;
  }, 30_000);

  afterAll(async () => {
    const own = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const officers = await prisma.user.findMany({ where: { email: { contains: unique } }, select: { id: true } });
    const allUserIds = [...new Set([...own, ...officers].map((u) => u.id))];
    const apps = await prisma.application.findMany({ where: { createdById: { in: allUserIds } }, select: { id: true } });
    if (apps.length > 0) await prisma.application.deleteMany({ where: { id: { in: apps.map((a) => a.id) } } });
    await prisma.notification.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.checklist.deleteMany({ where: { createdById: { in: allUserIds } } });
    await prisma.unitMember.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.unit.deleteMany({ where: { id: { in: [unitLow, unitHigh].filter(Boolean) } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.$disconnect();
  }, 30_000);

  it("scores a plain application LOW → desk scrutiny, no inspection needed", async () => {
    lowApp = await createDraft(applicant.token, unitLow, "MPCB_CTE");
    await finishAndSubmit(applicant.token, lowApp, "LOW");

    const res = await getRisk(env.token, lowApp);
    expect(res.status).toBe(200);
    const a = res.body.data.assessment;
    expect(a.category).toBe("LOW");
    expect(a.scrutinyLevel).toBe("DESK");
    expect(a.requiresInspection).toBe(false);
    expect(a.score).toBeLessThan(30);
    expect((a.factors as unknown[]).length).toBe(6);

    // Persisted — the same row comes back on recompute
    const again = await getRisk(env.token, lowApp);
    expect(again.body.data.assessment.id).toBe(a.id);

    // The application owner may also read their own assessment
    const own = await getRisk(applicant.token, lowApp);
    expect(own.status).toBe(200);
    expect(own.body.data.assessment.category).toBe("LOW");
  }, 30_000);

  it("classifies a RED checklist application HIGH → physical inspection expected", async () => {
    const cl = await request(app)
      .post("/api/v1/checklists")
      .set("Authorization", `Bearer ${applicant.token}`)
      .send({ unitId: unitHigh, name: "P6 pharma checklist", context: PHARMA_CONTEXT });
    expect(cl.status).toBe(201);
    expect(cl.body.data.checklist.riskCategory).toBe("RED");

    highApp = await createDraft(applicant.token, unitHigh, "MPCB_CTE", cl.body.data.checklist.items[0].id);
    await finishAndSubmit(applicant.token, highApp, "HIGH");

    const res = await getRisk(env.token, highApp);
    expect(res.status).toBe(200);
    const a = res.body.data.assessment;
    expect(a.category).toBe("HIGH");
    expect(a.scrutinyLevel).toBe("PHYSICAL");
    expect(a.requiresInspection).toBe(true);
    expect(a.score).toBeGreaterThanOrEqual(60);
    const factors = a.factors as { code: string; points: number }[];
    expect(factors.find((f) => f.code === "CLASSIFICATION")?.points).toBe(40);
    expect(factors.find((f) => f.code === "CAPITAL")?.points).toBe(25);
    expect(factors.find((f) => f.code === "WORKFORCE")?.points).toBe(15);
    highScore = a.score;
  }, 30_000);

  it("blocks applicants from planning inspections (RBAC)", async () => {
    const res = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${applicant.token}`)
      .send({ applicationId: highApp, scheduledAt: new Date(Date.now() + 86400000).toISOString() });
    expect(res.status).toBe(403);
  }, 30_000);

  async function userIdOf(suffix: string): Promise<string> {
    const u = await prisma.user.findUnique({
      where: { email: `${suffix}-${unique}@example.com` },
      select: { id: true },
    });
    if (!u) throw new Error(`user ${suffix} not found`);
    return u.id;
  }

  it("plans a joint inspection across ENV + INDUSTRY and notifies everyone", async () => {
    const when = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${state.token}`)
      .send({ applicationId: highApp, scheduledAt: when, venue: "Plot 12, MIDC Chakan" });
    expect(res.status).toBe(201);
    const insp = res.body.data.inspection;
    inspectionId = insp.id;
    expect(insp.status).toBe("SCHEDULED");
    expect(insp.riskScoreAtScheduling).toBe(highScore);
    expect((insp.participants as { department: { code: string } }[]).map((p) => p.department.code).sort()).toEqual(["ENV", "INDUSTRY"]);
    envParticipantId = (insp.participants as { id: string; department: { code: string } }[]).find((p) => p.department.code === "ENV")!.id;
    indParticipantId = (insp.participants as { id: string; department: { code: string } }[]).find((p) => p.department.code === "INDUSTRY")!.id;

    // Duplicate plan while one is open → 409
    const dup = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${state.token}`)
      .send({ applicationId: highApp, scheduledAt: when });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("INSPECTION_EXISTS");

    // Applicant notified + sees it on their application (and via the list API)
    const notifs = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${applicant.token}`);
    expect(notifs.body.data.items.some((n: { type: string; title: string }) => n.type === "INSPECTION" && n.title === "Site inspection scheduled")).toBe(true);

    const detail = await request(app).get(`/api/v1/applications/${highApp}`).set("Authorization", `Bearer ${applicant.token}`);
    const appInspections = detail.body.data.application.inspections;
    expect(appInspections).toHaveLength(1);
    expect(appInspections[0].participants).toHaveLength(2);

    const list = await request(app)
      .get(`/api/v1/inspections?applicationId=${highApp}`)
      .set("Authorization", `Bearer ${applicant.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
  }, 30_000);

  it("assigns one inspector per participating department", async () => {
    // Inspector directory for the dropdown
    const dir = await request(app).get("/api/v1/inspections/inspectors").set("Authorization", `Bearer ${env.token}`);
    expect(dir.status).toBe(200);
    const emailsInDir = (dir.body.data.items as { email: string }[]).map((i) => i.email);
    expect(emailsInDir).toContain(`p6ie-${unique}-${unique}@example.com`);
    expect(emailsInDir).toContain(`p6ii-${unique}-${unique}@example.com`);

    const inspEnvId = await userIdOf(`p6ie-${unique}`);
    const inspIndId = await userIdOf(`p6ii-${unique}`);

    // A non-inspector target is rejected
    const bad = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/assign`)
      .set("Authorization", `Bearer ${state.token}`)
      .send({ participantId: envParticipantId, inspectorId: emails[0] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_INSPECTOR");

    // Unknown participant → 404
    const missing = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/assign`)
      .set("Authorization", `Bearer ${state.token}`)
      .send({ participantId: "nope", inspectorId: inspEnvId });
    expect(missing.status).toBe(404);

    const a1 = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/assign`)
      .set("Authorization", `Bearer ${state.token}`)
      .send({ participantId: envParticipantId, inspectorId: inspEnvId });
    expect(a1.status).toBe(200);
    const a2 = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/assign`)
      .set("Authorization", `Bearer ${env.token}`)
      .send({ participantId: indParticipantId, inspectorId: inspIndId });
    expect(a2.status).toBe(200);

    // Assigned inspector got notified and sees their participant in the detail
    const notifs = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${inspEnv.token}`);
    expect(notifs.body.data.items.some((n: { title: string }) => n.title === "You are assigned to an inspection")).toBe(true);

    const view = await request(app).get(`/api/v1/inspections/${inspectionId}`).set("Authorization", `Bearer ${inspEnv.token}`);
    expect(view.status).toBe(200);
    expect(view.body.data.inspection.myParticipantIds).toContain(envParticipantId);
    expect(view.body.data.inspection.canManage).toBe(false);
  }, 30_000);

  it("guards start, observations and completion with role/state checks", async () => {
    // An inspector not assigned here cannot start
    const denied = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/start`)
      .set("Authorization", `Bearer ${inspFire.token}`);
    expect(denied.status).toBe(403);

    // Assigned inspector starts the visit
    const start = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/start`)
      .set("Authorization", `Bearer ${inspEnv.token}`);
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe("IN_PROGRESS");

    // Double-start → 409
    const again = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/start`)
      .set("Authorization", `Bearer ${inspEnv.token}`);
    expect(again.status).toBe(409);

    // Only assigned inspectors may file observations
    const fireObs = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/observation`)
      .set("Authorization", `Bearer ${inspFire.token}`)
      .send({ compliant: true, notes: "Not assigned here" });
    expect(fireObs.status).toBe(403);
    const officerObs = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/observation`)
      .set("Authorization", `Bearer ${env.token}`)
      .send({ compliant: true, notes: "Officer cannot observe" });
    expect(officerObs.status).toBe(403);

    // Both assigned inspectors file their department's notes
    const o1 = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/observation`)
      .set("Authorization", `Bearer ${inspInd.token}`)
      .send({ compliant: true, notes: "Labour norms verified on site" });
    expect(o1.status).toBe(201);
    const o2 = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/observation`)
      .set("Authorization", `Bearer ${inspEnv.token}`)
      .send({ compliant: false, notes: "ETP under construction; consent conditions not fully met" });
    expect(o2.status).toBe(201);

    // Officer completes with a consolidated report
    const done = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/complete`)
      .set("Authorization", `Bearer ${env.token}`)
      .send({ findings: "Joint visit completed; ETP must be commissioned within 30 days.", complianceStatus: "NON_COMPLIANT" });
    expect(done.status).toBe(200);

    const closed = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/complete`)
      .set("Authorization", `Bearer ${env.token}`)
      .send({ findings: "x", complianceStatus: "COMPLIANT" });
    expect(closed.status).toBe(409);

    // Detail shows the full picture
    const view = await request(app).get(`/api/v1/inspections/${inspectionId}`).set("Authorization", `Bearer ${state.token}`);
    const i = view.body.data.inspection;
    expect(i.status).toBe("COMPLETED");
    expect(i.complianceStatus).toBe("NON_COMPLIANT");
    expect(i.findings).toContain("ETP");
    expect(i.observations).toHaveLength(2);
    expect(i.participants.every((p: { observedAt: string | null }) => p.observedAt !== null)).toBe(true);
    const eventTypes = (i.events as { eventType: string }[]).map((e) => e.eventType);
    for (const t of ["INSPECTION_SCHEDULED", "INSPECTION_ASSIGNED", "INSPECTION_STARTED", "INSPECTION_OBSERVED", "INSPECTION_COMPLETED"]) {
      expect(eventTypes).toContain(t);
    }

    const notifs = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${applicant.token}`);
    expect(notifs.body.data.items.some((n: { title: string }) => n.title === "Inspection completed")).toBe(true);

    // Timeline also lands on the applicant's application view
    const detail = await request(app).get(`/api/v1/applications/${highApp}`).set("Authorization", `Bearer ${applicant.token}`);
    const trail = (detail.body.data.application.events as { eventType: string }[]).map((e) => e.eventType);
    expect(trail).toContain("INSPECTION_SCHEDULED");
    expect(trail).toContain("INSPECTION_COMPLETED");
    expect(detail.body.data.application.inspections[0].status).toBe("COMPLETED");
  }, 30_000);

  it("lifts the risk score after a non-compliant inspection", async () => {
    const res = await getRisk(env.token, highApp);
    expect(res.status).toBe(200);
    const a = res.body.data.assessment;
    expect(a.score).toBeGreaterThan(highScore);
    expect(a.score).toBeLessThanOrEqual(100);
    expect(a.category).toBe("HIGH");
    const factors = a.factors as { code: string; points: number }[];
    expect(factors.find((f) => f.code === "COMPLIANCE")?.points).toBe(30);
  }, 30_000);

  it("cancels a second planned inspection and blocks overlapping plans", async () => {
    const when = new Date(Date.now() + 172800000).toISOString();
    const res = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${state.token}`)
      .send({ applicationId: highApp, scheduledAt: when });
    expect(res.status).toBe(201);
    const secondId = res.body.data.inspection.id;

    // Only one open inspection per application
    const third = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${state.token}`)
      .send({ applicationId: highApp, scheduledAt: when });
    expect(third.status).toBe(409);

    const cancel = await request(app)
      .post(`/api/v1/inspections/${secondId}/cancel`)
      .set("Authorization", `Bearer ${env.token}`)
      .send({ reason: "Unit requested rescheduling" });
    expect(cancel.status).toBe(200);

    const view = await request(app).get(`/api/v1/inspections/${secondId}`).set("Authorization", `Bearer ${state.token}`);
    expect(view.body.data.inspection.status).toBe("CANCELLED");

    // Cannot cancel twice
    const again = await request(app)
      .post(`/api/v1/inspections/${secondId}/cancel`)
      .set("Authorization", `Bearer ${env.token}`)
      .send({ reason: "x" });
    expect(again.status).toBe(409);

    const notifs = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${applicant.token}`);
    expect(notifs.body.data.items.some((n: { title: string }) => n.title === "Inspection cancelled")).toBe(true);

    // Inspector "mine" view contains the completed first inspection
    const mine = await request(app).get("/api/v1/inspections?mine=true").set("Authorization", `Bearer ${inspEnv.token}`);
    expect(mine.status).toBe(200);
    expect((mine.body.data.items as { id: string }[]).map((i) => i.id)).toContain(inspectionId);
  }, 30_000);



});

