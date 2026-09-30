import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma.js";
import { app, createOfficer, registerApplicant, unique, type Session } from "./p5.helpers.js";

describe("Phase 8 — incentives: eligibility & utilisation", () => {
  const emails = [`p8a-${unique}@example.com`, `p8f-${unique}@example.com`];
  const officerEmails = [`p8dept-${unique}@example.com`, `p8st-${unique}@example.com`];
  const applicant = { token: "" };
  const foreign = { token: "" };
  let dept: Session, state: Session;
  let unitId = "", msmeId = "", skillId = "", greenId = "";
  let claim1 = "", claim2 = "", claim3 = "";

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    await prisma.$connect();
    applicant.token = (await registerApplicant(emails[0])).token;
    foreign.token = (await registerApplicant(emails[1])).token;
    dept = await createOfficer("DEPARTMENT_USER", "ENV", "p8dept");
    state = await createOfficer("STATE_ADMIN", "ENV", "p8st");

    const userRow = await prisma.user.findUnique({ where: { email: emails[0] }, select: { id: true } });
    const unit = await prisma.unit.create({
      data: { name: "P8 MSME Unit", industryType: "textiles", sector: "Textiles", state: "Maharashtra", district: "Pune", employeeCount: 60, capitalInvestment: 25000000 },
    });
    await prisma.unitMember.create({ data: { unitId: unit.id, userId: userRow!.id, role: "OWNER" } });
    unitId = unit.id;

    msmeId = (await prisma.incentiveScheme.findUnique({ where: { code: "MSME_CAPITAL_SUBSIDY_001" } }))!.id;
    skillId = (await prisma.incentiveScheme.findUnique({ where: { code: "SKILL_DEVELOPMENT_GRANT_001" } }))!.id;
    greenId = (await prisma.incentiveScheme.findUnique({ where: { code: "GREEN_COMPLIANCE_BONUS_001" } }))!.id;
  }, 30_000);

  afterAll(async () => {
    const all = await prisma.user.findMany({ where: { email: { in: [...emails, ...officerEmails] } }, select: { id: true } });
    const userIds = all.map((u) => u.id);
    await prisma.incentiveClaimEvent.deleteMany({ where: { claim: { unitId } } });
    await prisma.incentiveClaim.deleteMany({ where: { unitId } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.unitMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.unit.deleteMany({ where: { members: { none: {} } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }, 30_000);

  it("lists the seeded catalogue with live per-unit eligibility, scoped to members", async () => {
    const res = await request(app).get(`/api/v1/incentives/schemes?unitId=${unitId}`).set(auth(applicant.token));
    expect(res.status).toBe(200);
    const items = res.body.data.items as any[];
    expect(items.length).toBeGreaterThanOrEqual(4);

    const msme = items.find((s) => s.code === "MSME_CAPITAL_SUBSIDY_001");
    expect(msme.eligibility.eligible).toBe(true);
    expect(msme.eligibility.checks.every((c: any) => c.passed)).toBe(true);
    expect(msme.eligibility.checks.map((c: any) => c.key)).toContain("capitalInvestment_lte");
    expect(msme.myClaim).toBeNull();

    const green = items.find((s) => s.code === "GREEN_COMPLIANCE_BONUS_001");
    expect(green.eligibility.eligible).toBe(false);
    const failedKeys = green.eligibility.checks.filter((c: any) => !c.passed).map((c: any) => c.key);
    expect(failedKeys).toContain("isVerified");

    const peek = await request(app).get(`/api/v1/incentives/schemes?unitId=${unitId}`).set(auth(foreign.token));
    expect(peek.status).toBe(404);
  }, 30_000);

  it("dry-runs eligibility with human-readable expected/actual checks", async () => {
    const res = await request(app)
      .post(`/api/v1/incentives/schemes/${skillId}/check`)
      .set(auth(applicant.token))
      .send({ unitId });
    expect(res.status).toBe(200);
    const { scheme, eligibility, myClaim } = res.body.data;
    expect(scheme.code).toBe("SKILL_DEVELOPMENT_GRANT_001");
    expect(eligibility.windowOpen).toBe(true);
    expect(eligibility.checks[0]).toMatchObject({ key: "employeeCount_gte", passed: true, actual: 60 });
    expect(myClaim).toBeNull();

    const denied = await request(app)
      .post(`/api/v1/incentives/schemes/${skillId}/check`)
      .set(auth(foreign.token))
      .send({ unitId });
    expect(denied.status).toBe(404);
  }, 30_000);

  it("files a claim after server-side checks and blocks ineligibles, over-asks and duplicates", async () => {
    const over = await request(app).post("/api/v1/incentives/claims").set(auth(applicant.token)).send({
      schemeId: msmeId, unitId, requestedAmountInr: 6_000_000,
    });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe("AMOUNT_EXCEEDS_CEILING");

    const inelig = await request(app).post("/api/v1/incentives/claims").set(auth(applicant.token)).send({
      schemeId: greenId, unitId, requestedAmountInr: 100_000,
    });
    expect(inelig.status).toBe(422);
    expect(inelig.body.error.code).toBe("CLAIM_INELIGIBLE");
    expect(inelig.body.error.details.checks.some((c: any) => !c.passed)).toBe(true);

    const nope = await request(app).post("/api/v1/incentives/claims").set(auth(foreign.token)).send({
      schemeId: msmeId, unitId, requestedAmountInr: 4_000_000,
    });
    expect(nope.status).toBe(404);

    const ok = await request(app).post("/api/v1/incentives/claims").set(auth(applicant.token)).send({
      schemeId: msmeId, unitId, requestedAmountInr: 4_000_000, notes: "p8 seed claim",
    });
    expect(ok.status).toBe(201);
    claim1 = ok.body.data.claim.id;
    expect(ok.body.data.claim.status).toBe("SUBMITTED");
    expect(ok.body.data.claim.eligibility.eligible).toBe(true);

    const dup = await request(app).post("/api/v1/incentives/claims").set(auth(applicant.token)).send({
      schemeId: msmeId, unitId, requestedAmountInr: 4_000_000,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CLAIM_IN_PROGRESS");

    const events = await prisma.incentiveClaimEvent.findMany({ where: { claimId: claim1 } });
    expect(events.map((e) => e.eventType)).toContain("CLAIM_SUBMITTED");

    const notifs = await request(app).get("/api/v1/notifications").set(auth(state.token));
    expect((notifs.body.data.items as any[]).some((n) => n.type === "INCENTIVE" && n.title === "New incentive claim")).toBe(true);
  }, 30_000);

  it("drives SUBMITTED → UNDER_REVIEW → APPROVED → DISBURSED → UTILISED with RBAC guards", async () => {
    const applicantCan = (await request(app).post(`/api/v1/incentives/claims/${claim1}/review`).set(auth(applicant.token)));
    expect(applicantCan.status).toBe(403);

    const rv = await request(app).post(`/api/v1/incentives/claims/${claim1}/review`).set(auth(dept.token));
    expect(rv.status).toBe(200);
    expect(rv.body.data.claim.status).toBe("UNDER_REVIEW");

    const rv2 = await request(app).post(`/api/v1/incentives/claims/${claim1}/review`).set(auth(dept.token));
    expect(rv2.status).toBe(409);
    expect(rv2.body.error.code).toBe("BAD_STATE");

    const applicantDecides = await request(app)
      .post(`/api/v1/incentives/claims/${claim1}/decide`)
      .set(auth(applicant.token))
      .send({ approved: true });
    expect(applicantDecides.status).toBe(403);

    const overAsk = await request(app)
      .post(`/api/v1/incentives/claims/${claim1}/decide`)
      .set(auth(dept.token))
      .send({ approved: true, amountInr: 5_000_000 });
    expect(overAsk.status).toBe(422);

    const ap = await request(app)
      .post(`/api/v1/incentives/claims/${claim1}/decide`)
      .set(auth(dept.token))
      .send({ approved: true, amountInr: 3_500_000, notes: "Sanctioned as per norms" });
    expect(ap.status).toBe(200);
    expect(ap.body.data.claim.status).toBe("APPROVED");
    expect(ap.body.data.claim.approvedAmountInr).toBe(3_500_000);
    expect(ap.body.data.claim.decidedAt).toBeTruthy();

    const deptMoney = await request(app)
      .post(`/api/v1/incentives/claims/${claim1}/disburse`)
      .set(auth(dept.token))
      .send({ reference: "UTR-X" });
    expect(deptMoney.status).toBe(403);

    const ds = await request(app)
      .post(`/api/v1/incentives/claims/${claim1}/disburse`)
      .set(auth(state.token))
      .send({ reference: "UTR-2026-P8-001" });
    expect(ds.status).toBe(200);
    expect(ds.body.data.claim.status).toBe("DISBURSED");
    expect(ds.body.data.claim.disbursementRef).toBe("UTR-2026-P8-001");

    const officerUtilise = await request(app)
      .post(`/api/v1/incentives/claims/${claim1}/utilise`)
      .set(auth(state.token))
      .send({ notes: "nope" });
    expect(officerUtilise.status).toBe(403);

    const ut = await request(app)
      .post(`/api/v1/incentives/claims/${claim1}/utilise`)
      .set(auth(applicant.token))
      .send({ notes: "Deployed towards power loom upgrade" });
    expect(ut.status).toBe(200);
    expect(ut.body.data.claim.status).toBe("UTILISED");
    expect(ut.body.data.claim.utilisedAt).toBeTruthy();

    const again = await request(app).post("/api/v1/incentives/claims").set(auth(applicant.token)).send({
      schemeId: msmeId, unitId, requestedAmountInr: 1_000_000,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("CLAIM_ALREADY_AVAILED");

    const applicantNotif = await request(app).get("/api/v1/notifications").set(auth(applicant.token));
    const titles = (applicantNotif.body.data.items as any[]).map((n) => n.title);
    expect(titles).toContain("Claim under review");
    expect(titles).toContain("Incentive claim approved");
    expect(titles).toContain("Incentive disbursed");
  }, 30_000);

  it("records a rejection with notes and lets the unit re-apply afterwards", async () => {
    const filed = await request(app).post("/api/v1/incentives/claims").set(auth(applicant.token)).send({
      schemeId: skillId, unitId, requestedAmountInr: 600_000,
    });
    expect(filed.status).toBe(201);
    claim2 = filed.body.data.claim.id;

    await request(app).post(`/api/v1/incentives/claims/${claim2}/review`).set(auth(dept.token));

    const rj = await request(app)
      .post(`/api/v1/incentives/claims/${claim2}/decide`)
      .set(auth(dept.token))
      .send({ approved: false, notes: "Training attendance records incomplete" });
    expect(rj.status).toBe(200);
    expect(rj.body.data.claim.status).toBe("REJECTED");
    expect(rj.body.data.claim.approvedAmountInr).toBeNull();

    // A rejected claim does not block a fresh attempt (REJECTED is not blocking).
    const retry = await request(app).post("/api/v1/incentives/claims").set(auth(applicant.token)).send({
      schemeId: skillId, unitId, requestedAmountInr: 600_000, notes: "Re-filed with full records",
    });
    expect(retry.status).toBe(201);
    expect(retry.body.data.claim.status).toBe("SUBMITTED");
    claim3 = retry.body.data.claim.id;

    const notified = await request(app).get("/api/v1/notifications").set(auth(applicant.token));
    const rejectedNote = (notified.body.data.items as any[]).find((n) => n.title === "Incentive claim rejected");
    expect(rejectedNote).toBeTruthy();
    expect(rejectedNote.message).toContain("Training attendance records incomplete");
  }, 30_000);

  it("returns claim detail with the full audit timeline and action flags", async () => {
    const res = await request(app).get(`/api/v1/incentives/claims/${claim1}`).set(auth(applicant.token));
    expect(res.status).toBe(200);
    expect(res.body.data.claim.status).toBe("UTILISED");
    expect(res.body.data.scheme.code).toBe("MSME_CAPITAL_SUBSIDY_001");
    expect(res.body.data.unit.name).toBe("P8 MSME Unit");
    const types = (res.body.data.events as any[]).map((e) => e.eventType);
    expect(types).toEqual([
      "CLAIM_SUBMITTED",
      "CLAIM_REVIEW_STARTED",
      "CLAIM_APPROVED",
      "CLAIM_DISBURSED",
      "CLAIM_UTILISED",
    ]);
    expect(res.body.data.can).toEqual({ review: false, decide: false, disburse: false, utilise: false });

    const officerView = await request(app).get(`/api/v1/incentives/claims/${claim3}`).set(auth(dept.token));
    expect(officerView.status).toBe(200);
    expect(officerView.body.data.can.decide).toBe(false); // claim3 is SUBMITTED, only review applies
    expect(officerView.body.data.can.review).toBe(true);

    const denied = await request(app).get(`/api/v1/incentives/claims/${claim1}`).set(auth(foreign.token));
    expect(denied.status).toBe(404);
  }, 30_000);

  it("scopes the claims queue: officers see all, applicants see only their units", async () => {
    const mine = await request(app).get("/api/v1/incentives/claims").set(auth(applicant.token));
    expect(mine.status).toBe(200);
    const myItems = mine.body.data.items as any[];
    expect(myItems.length).toBeGreaterThanOrEqual(3);
    expect(myItems.every((c) => c.unitId === unitId)).toBe(true);
    expect(myItems[0].scheme.name).toBeTruthy();

    const theirs = await request(app).get("/api/v1/incentives/claims").set(auth(foreign.token));
    expect(theirs.status).toBe(200);
    expect(theirs.body.data.items).toHaveLength(0);

    const queue = await request(app).get("/api/v1/incentives/claims").set(auth(dept.token));
    expect(queue.status).toBe(200);
    const queueItems = queue.body.data.items as any[];
    expect(queueItems.some((c) => c.id === claim1)).toBe(true);
    expect(queue.body.data.counts.UTILISED).toBeGreaterThanOrEqual(1);
    expect(queue.body.data.counts.SUBMITTED).toBeGreaterThanOrEqual(1);

    const filtered = await request(app).get("/api/v1/incentives/claims?status=REJECTED").set(auth(dept.token));
    expect((filtered.body.data.items as any[]).every((c) => c.status === "REJECTED")).toBe(true);
    expect((filtered.body.data.items as any[]).some((c) => c.id === claim2)).toBe(true);
  }, 30_000);
});
