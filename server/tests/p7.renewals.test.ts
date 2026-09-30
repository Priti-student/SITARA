import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma.js";
import { app, createOfficer, deptView, fillAndSubmit, registerApplicant, unique, type Session } from "./p5.helpers.js";

describe("Phase 7 — renewals & compliance monitoring", () => {
  const emails = [`p7a-${unique}@example.com`, `p7f-${unique}@example.com`, `p7env-${unique}@example.com`, `p7ap-${unique}@example.com`, `p7st-${unique}@example.com`];
  const applicant = { token: "" };
  const foreign = { token: "" };
  let env: Session, ap: Session, state: Session;
  let unitId = "", appId = "", approvalId = "", approvalNo = "", draftId = "", caseId = "", inspectionId = "";

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function approve(targetApp: string, token: string, instanceId: string, comment: string) {
    return request(app).post(`/api/v1/department/applications/${targetApp}/approve`).set(auth(token)).send({ instanceId, comment });
  }

  /** Drives the single ENV track of MPCB_CTO to full approval. */
  async function driveEnv(targetApp: string) {
    const v1 = await deptView(env.token, targetApp);
    const step1 = v1.workflowInstances.find((i: { department: { code: string } }) => i.department.code === "ENV");
    const r1 = await approve(targetApp, env.token, step1.id, "p7 step 1");
    expect(r1.status).toBe(200);
    const v2 = await deptView(env.token, targetApp);
    const step2 = v2.workflowInstances.find((i: { department: { code: string } }) => i.department.code === "ENV");
    const r2 = await approve(targetApp, ap.token, step2.id, "p7 step 2");
    expect(r2.status).toBe(200);
  }

  /** Completes an existing draft (renewal application): docs + form + submit. */
  async function completeDraft(token: string, targetApp: string) {
    const detail = await request(app).get(`/api/v1/applications/${targetApp}`).set(auth(token));
    const at = detail.body.data.application.approvalType;
    for (const r of at.requirements) {
      const up = await request(app)
        .post(`/api/v1/applications/${targetApp}/documents`)
        .set(auth(token))
        .attach("file", Buffer.from(`%PDF p7 ${r.documentType.code}`), `${r.documentType.code}.pdf`)
        .field("documentType", r.documentType.code);
      if (up.status !== 201) throw new Error(`upload ${r.documentType.code} -> ${up.status}`);
    }
    const formData: Record<string, unknown> = {};
    for (const f of at.formSchema) {
      if (f.required) formData[f.key] = f.type === "number" ? 5000 : f.options ? f.options[0] : "VALUE";
    }
    const form = await request(app).put(`/api/v1/applications/${targetApp}/form`).set(auth(token)).send({ formData });
    expect(form.status).toBe(200);
    const submit = await request(app).post(`/api/v1/applications/${targetApp}/submit`).set(auth(token));
    expect(submit.status).toBe(200);
    expect(submit.body.data.application.status).toBe("UNDER_SCRUTINY");
  }

  beforeAll(async () => {
    await prisma.$connect();
    applicant.token = (await registerApplicant(emails[0])).token;
    foreign.token = (await registerApplicant(emails[1])).token;
    env = await createOfficer("DEPARTMENT_USER", "ENV", "p7env");
    ap = await createOfficer("APPROVING_AUTHORITY", "ENV", "p7ap");
    state = await createOfficer("STATE_ADMIN", "ENV", "p7st");

    const userRow = await prisma.user.findUnique({ where: { email: emails[0] }, select: { id: true } });
    const unit = await prisma.unit.create({
      data: { name: "P7 Pharma Unit", industryType: "pharmaceuticals", sector: "Pharmaceuticals", state: "Maharashtra", district: "Pune", employeeCount: 40, capitalInvestment: 25000000 },
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

  it("issues a CTO approval with a 365-day validity after the ENV track clears", async () => {
    appId = await fillAndSubmit(applicant.token, unitId, "MPCB_CTO", "P7CTO");
    await driveEnv(appId);

    const final = await deptView(env.token, appId);
    expect(final.status).toBe("APPROVED");
    expect(final.approvals).toHaveLength(1);

    const approval = await prisma.approval.findFirst({ where: { applicationId: appId } });
    expect(approval).toBeTruthy();
    approvalId = approval!.id;
    approvalNo = approval!.approvalNo;
    expect(approval!.status).toBe("ACTIVE");
    expect(approval!.renewalCount).toBe(0);
    expect(approval!.renewalAlertAt).toBeNull();
    expect(approval!.renewedAt).toBeNull();
    const days = Math.round((approval!.validTill!.getTime() - Date.now()) / 86400000);
    expect(days).toBeGreaterThanOrEqual(364);
    expect(days).toBeLessThanOrEqual(366);
  }, 30_000);

  it("lists due renewals scoped to the owner and reports readiness", async () => {
    // Make the approval due within the default 60-day window.
    await prisma.approval.update({ where: { id: approvalId }, data: { validTill: new Date(Date.now() + 30 * 86400000) } });

    const mine = await request(app).get("/api/v1/renewals/due").set(auth(applicant.token));
    expect(mine.status).toBe(200);
    const row = (mine.body.data.items as any[]).find((a) => a.id === approvalId);
    expect(row).toBeTruthy();
    expect(row.state).toBe("DUE_SOON");
    expect(row.daysLeft).toBeGreaterThanOrEqual(29);
    expect(row.daysLeft).toBeLessThanOrEqual(31);
    expect(row.approvalType.code).toBe("MPCB_CTO");
    expect(row.openComplianceCases).toBe(0);

    const theirs = await request(app).get("/api/v1/renewals/due").set(auth(foreign.token));
    expect(theirs.status).toBe(200);
    expect((theirs.body.data.items as any[]).some((a) => a.id === approvalId)).toBe(false);

    const narrow = await request(app).get("/api/v1/renewals/due?days=5").set(auth(applicant.token));
    expect((narrow.body.data.items as any[]).some((a) => a.id === approvalId)).toBe(false);

    const peek = await request(app).get(`/api/v1/renewals/${approvalId}`).set(auth(foreign.token));
    expect(peek.status).toBe(404);

    const ready = await request(app).get(`/api/v1/renewals/${approvalId}`).set(auth(applicant.token));
    expect(ready.status).toBe(200);
    const readiness = ready.body.data.readiness;
    expect(readiness.canRenew).toBe(true);
    expect(readiness.blockers).toHaveLength(0);
    expect(readiness.openComplianceCases).toBe(0);
    expect(readiness.state).toBe("DUE_SOON");
    expect(readiness.approval.approvalNo).toBe(approvalNo);
  }, 30_000);

  it("auto-opens a compliance case from a non-compliant inspection and blocks renewal", async () => {
    const plan = await request(app).post("/api/v1/inspections").set(auth(state.token)).send({
      applicationId: appId,
      scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      departmentCodes: ["ENV"],
      title: "P7 compliance check",
    });
    expect(plan.status).toBe(201);
    inspectionId = plan.body.data.inspection.id;

    const start = await request(app).post(`/api/v1/inspections/${inspectionId}/start`).set(auth(state.token));
    expect(start.status).toBe(200);

    const done = await request(app).post(`/api/v1/inspections/${inspectionId}/complete`).set(auth(state.token)).send({
      findings: "Effluent treatment plant under-dimensioned",
      complianceStatus: "NON_COMPLIANT",
    });
    expect(done.status).toBe(200);

    const list = await request(app).get("/api/v1/compliance").set(auth(applicant.token));
    expect(list.status).toBe(200);
    const c = (list.body.data.items as any[]).find((x) => x.inspection?.id === inspectionId);
    expect(c).toBeTruthy();
    caseId = c.id;
    expect(c.status).toBe("OPEN");
    expect(c.severity).toBe("NON_COMPLIANT");
    expect(c.overdue).toBe(false);
    expect(list.body.data.counts.OPEN).toBeGreaterThanOrEqual(1);

    const unit = await request(app).get(`/api/v1/compliance/units/${unitId}`).set(auth(applicant.token));
    expect(unit.status).toBe(200);
    expect(unit.body.data.status).toBe("NON_COMPLIANT");
    expect(unit.body.data.openCases).toBeGreaterThanOrEqual(1);

    const ready = await request(app).get(`/api/v1/renewals/${approvalId}`).set(auth(applicant.token));
    const r = ready.body.data.readiness;
    expect(r.openComplianceCases).toBeGreaterThanOrEqual(1);
    expect(r.canRenew).toBe(false);
    expect(r.blockers[0].code).toBe("OPEN_COMPLIANCE_CASE");

    const blocked = await request(app).post("/api/v1/renewals").set(auth(applicant.token)).send({ approvalId });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("OPEN_COMPLIANCE_CASE");

    const notifs = await request(app).get("/api/v1/notifications").set(auth(applicant.token));
    expect((notifs.body.data.items as any[]).some((n) => n.type === "COMPLIANCE" && n.title === "Compliance case opened")).toBe(true);
  }, 30_000);

  it("runs the remediation loop: reopen on reject, resolve on accept", async () => {
    const officerTry = await request(app).post(`/api/v1/compliance/${caseId}/remediate`).set(auth(state.token)).send({ notes: "x" });
    expect(officerTry.status).toBe(403);

    const earlyResolve = await request(app).post(`/api/v1/compliance/${caseId}/resolve`).set(auth(state.token)).send({ accepted: true });
    expect(earlyResolve.status).toBe(409);

    const foreignTry = await request(app).post(`/api/v1/compliance/${caseId}/remediate`).set(auth(foreign.token)).send({ notes: "x" });
    expect(foreignTry.status).toBe(404);

    const remediate = await request(app).post(`/api/v1/compliance/${caseId}/remediate`).set(auth(applicant.token)).send({
      notes: "Installed a larger ETP tank; commissioning report attached",
    });
    expect(remediate.status).toBe(200);
    expect(remediate.body.data.case.status).toBe("REMEDIATED");

    const rejected = await request(app).post(`/api/v1/compliance/${caseId}/resolve`).set(auth(state.token)).send({
      accepted: false,
      notes: "Sludge disposal receipts missing",
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.case.status).toBe("OPEN");

    const again = await request(app).post(`/api/v1/compliance/${caseId}/remediate`).set(auth(applicant.token)).send({
      notes: "Receipts uploaded along with lab analysis",
    });
    expect(again.status).toBe(200);

    const resolved = await request(app).post(`/api/v1/compliance/${caseId}/resolve`).set(auth(state.token)).send({
      accepted: true,
      notes: "Verified on site",
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.case.status).toBe("RESOLVED");
    expect(resolved.body.data.case.resolvedAt).toBeTruthy();

    const unit = await request(app).get(`/api/v1/compliance/units/${unitId}`).set(auth(applicant.token));
    expect(unit.body.data.status).toBe("REMEDIATED");
    expect(unit.body.data.openCases).toBe(0);

    const detail = await request(app).get(`/api/v1/compliance/${caseId}`).set(auth(applicant.token));
    expect(detail.status).toBe(200);
    const events = (detail.body.data.case.events as any[]).map((e) => e.eventType);
    expect(events).toContain("CASE_OPENED");
    expect(events).toContain("CASE_REMEDIATED");
    expect(events).toContain("CASE_REOPENED");
    expect(events).toContain("CASE_RESOLVED");

    const ready = await request(app).get(`/api/v1/renewals/${approvalId}`).set(auth(applicant.token));
    expect(ready.body.data.readiness.canRenew).toBe(true);
    expect(ready.body.data.readiness.openComplianceCases).toBe(0);
  }, 30_000);

  it("creates a renewal draft prefilled from the original and blocks duplicates", async () => {
    const original = await prisma.application.findUnique({ where: { id: appId }, select: { formData: true } });

    const create = await request(app).post("/api/v1/renewals").set(auth(applicant.token)).send({ approvalId });
    expect(create.status).toBe(201);
    draftId = create.body.data.application.id;
    expect(create.body.data.application.status).toBe("DRAFT");
    expect(create.body.data.application.linkedApprovalId).toBe(approvalId);
    expect(create.body.data.application.formData).toEqual(original!.formData);

    const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
    expect(approval!.renewalApplicationId).toBe(draftId);

    const events = await prisma.workflowEvent.findMany({ where: { applicationId: draftId }, select: { eventType: true } });
    expect(events.map((e) => e.eventType)).toContain("RENEWAL_REQUESTED");

    const notifs = await request(app).get("/api/v1/notifications").set(auth(applicant.token));
    expect((notifs.body.data.items as any[]).some((n) => n.type === "RENEWAL" && n.title === "Renewal draft created")).toBe(true);

    const dup = await request(app).post("/api/v1/renewals").set(auth(applicant.token)).send({ approvalId });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("RENEWAL_PENDING");

    const ready = await request(app).get(`/api/v1/renewals/${approvalId}`).set(auth(applicant.token));
    const r = ready.body.data.readiness;
    expect(r.canRenew).toBe(false);
    expect(r.blockers[0].code).toBe("RENEWAL_PENDING");
    expect(r.pendingRenewal.id).toBe(draftId);
  }, 30_000);

  it("renews the same approval (new validity) when the renewal workflow clears", async () => {
    const before = await prisma.approval.findUnique({ where: { id: approvalId } });
    expect(before!.approvalNo).toBe(approvalNo);

    await completeDraft(applicant.token, draftId);
    await driveEnv(draftId);

    const renewalApp = await prisma.application.findUnique({ where: { id: draftId }, select: { status: true, linkedApprovalId: true } });
    expect(renewalApp!.status).toBe("APPROVED");
    expect(renewalApp!.linkedApprovalId).toBe(approvalId);
    // The renewal reuses the original certificate — no second Approval row.
    expect(await prisma.approval.count({ where: { applicationId: draftId } })).toBe(0);

    const after = await prisma.approval.findUnique({ where: { id: approvalId } });
    expect(after!.status).toBe("ACTIVE");
    expect(after!.renewalCount).toBe(1);
    expect(after!.renewedAt).toBeTruthy();
    expect(after!.renewalAlertAt).toBeNull();
    expect(after!.renewalApplicationId).toBe(draftId);
    expect(after!.approvalNo).toBe(approvalNo);
    expect(after!.validTill!.getTime()).toBeGreaterThan(Date.now() + 360 * 86400000);

    const due = await request(app).get("/api/v1/renewals/due?days=400").set(auth(applicant.token));
    const row = (due.body.data.items as any[]).find((a) => a.id === approvalId);
    expect(row).toBeTruthy();
    expect(row.hasPendingRenewal).toBe(false);
    expect(row.renewalCount).toBe(1);

    const notifs = await request(app).get("/api/v1/notifications").set(auth(applicant.token));
    expect((notifs.body.data.items as any[]).some((n) => n.type === "RENEWAL" && n.title === "Approval renewed")).toBe(true);

    const events = await prisma.workflowEvent.findMany({ where: { applicationId: draftId }, select: { eventType: true } });
    expect(events.map((e) => e.eventType)).toContain("RENEWAL_COMPLETED");
  }, 30_000);

  it("sweeps lapsed approvals and sends one pre-expiry alert per cycle", async () => {
    // 1) Past validity → EXPIRED + notification.
    await prisma.approval.update({
      where: { id: approvalId },
      data: { status: "ACTIVE", validTill: new Date(Date.now() - 86400000), renewalAlertAt: null },
    });
    const sweep1 = await request(app).post("/api/v1/renewals/sweep").set(auth(state.token));
    expect(sweep1.status).toBe(200);
    expect(sweep1.body.data.expired).toBeGreaterThanOrEqual(1);

    const lapsed = await prisma.approval.findUnique({ where: { id: approvalId } });
    expect(lapsed!.status).toBe("EXPIRED");

    const dueList = await request(app).get("/api/v1/renewals/due").set(auth(applicant.token));
    const expiredRow = (dueList.body.data.items as any[]).find((a) => a.id === approvalId);
    expect(expiredRow).toBeTruthy();
    expect(expiredRow.state).toBe("EXPIRED");

    const notifs1 = await request(app).get("/api/v1/notifications").set(auth(applicant.token));
    expect((notifs1.body.data.items as any[]).some((n) => n.type === "RENEWAL" && n.title === "Approval expired")).toBe(true);

    // 2) Within the alert window → exactly one pre-expiry alert per cycle.
    await prisma.approval.update({
      where: { id: approvalId },
      data: { status: "ACTIVE", validTill: new Date(Date.now() + 10 * 86400000), renewalAlertAt: null },
    });
    const countAlerts = async () => {
      const n = await request(app).get("/api/v1/notifications").set(auth(applicant.token));
      return (n.body.data.items as any[]).filter((x) => x.type === "RENEWAL" && x.title === "Renewal due soon").length;
    };
    const before1 = await countAlerts();
    const sweep2 = await request(app).post("/api/v1/renewals/sweep").set(auth(state.token));
    expect(sweep2.status).toBe(200);
    const alerted = await prisma.approval.findUnique({ where: { id: approvalId }, select: { renewalAlertAt: true } });
    expect(alerted!.renewalAlertAt).not.toBeNull();
    expect(await countAlerts()).toBeGreaterThanOrEqual(before1 + 1);

    const before2 = await countAlerts();
    await request(app).post("/api/v1/renewals/sweep").set(auth(state.token));
    expect(await countAlerts()).toBe(before2);

    // 3) Sweep is officer-only.
    const denied = await request(app).post("/api/v1/renewals/sweep").set(auth(applicant.token));
    expect(denied.status).toBe(403);
  }, 30_000);
});
