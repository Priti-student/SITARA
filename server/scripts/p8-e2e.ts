// Phase 8 LIVE end-to-end against a running server.
// 1) npm run dev   2) npm run db:seed:demo   3) npx tsx scripts/p8-e2e.ts
import { env } from "../src/config/env.js";
import { prisma } from "../src/utils/prisma.js";

const BASE = `http://127.0.0.1:${env.PORT ?? 4000}`;
const PASSWORD = env.DEMO_USER_PASSWORD;
if (!PASSWORD) throw new Error("DEMO_USER_PASSWORD missing in server/.env");

let n = 0;
let failed = false;
function ok(cond: boolean, label: string): void {
  n += 1;
  if (!cond) failed = true;
  console.log(`  ${String(n).padStart(2)}. ${cond ? "PASS" : "FAIL"}  ${label}`);
}

async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  let json: any = {};
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, body: json };
}

async function login(email: string): Promise<string> {
  const r = await api("/api/v1/auth/login", { body: { email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${email} -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.data.accessToken as string;
}

async function main(): Promise<void> {
  const health = await api("/api/v1/health");
  ok(health.status === 200, "server health");

  const applicant = await login("demo-applicant@sitara.test");
  const dept = await login("demo-department_user-env@sitara.test");
  const state = await login("demo-state_admin-industry@sitara.test");
  ok(true, "applicant / department desk / state admin signed in");

  // ── Unit (qualifies for MSME: capital ≤ ₹5 crore, employees ≤ 500) ──
  const unit = await api("/api/v1/units", {
    token: applicant,
    body: {
      name: `P8 Live Unit ${Date.now()}`,
      industryType: "textiles",
      sector: "Textiles",
      state: "Maharashtra",
      district: "Pune",
      employeeCount: 60,
      capitalInvestment: 25_000_000,
    },
  });
  ok(unit.status === 201, `unit created (${unit.status})`);
  const unitId = unit.body.data.unit.id as string;

  // ── Catalogue + live per-unit eligibility ──
  const cat = await api(`/api/v1/incentives/schemes?unitId=${unitId}`, { token: applicant });
  ok(cat.status === 200, `scheme catalogue loaded (${cat.status})`);
  const items = cat.body.data.items as any[];
  ok(items.length >= 4, `catalogue lists ${items.length} seeded schemes`);
  const msme = items.find((s) => s.code === "MSME_CAPITAL_SUBSIDY_001");
  const skill = items.find((s) => s.code === "SKILL_DEVELOPMENT_GRANT_001");
  const green = items.find((s) => s.code === "GREEN_COMPLIANCE_BONUS_001");
  ok(msme?.eligibility?.eligible === true, "unit is eligible for the MSME capital subsidy");
  ok(green?.eligibility?.eligible === false, "unit is NOT eligible for the green bonus (not verified)");

  const check = await api(`/api/v1/incentives/schemes/${msme.id}/check`, {
    token: applicant,
    body: { unitId },
  });
  ok(
    check.status === 200 && check.body.data.eligibility.checks.every((c: any) => c.passed),
    "dry-run eligibility: every check passes",
  );

  // ── Filing guards ──
  const over = await api("/api/v1/incentives/claims", {
    token: applicant,
    body: { schemeId: msme.id, unitId, requestedAmountInr: 6_000_000 },
  });
  ok(over.status === 422 && over.body.error.code === "AMOUNT_EXCEEDS_CEILING", "over-ask refused (422 ceiling)");

  const inelig = await api("/api/v1/incentives/claims", {
    token: applicant,
    body: { schemeId: green.id, unitId, requestedAmountInr: 100_000 },
  });
  ok(inelig.status === 422 && inelig.body.error.code === "CLAIM_INELIGIBLE", "ineligible unit refused (422)");

  const claim = await api("/api/v1/incentives/claims", {
    token: applicant,
    body: { schemeId: msme.id, unitId, requestedAmountInr: 4_000_000, notes: "p8 live claim" },
  });
  ok(claim.status === 201 && claim.body.data.claim.status === "SUBMITTED", `claim filed (${claim.status})`);
  const claimId = claim.body.data.claim.id as string;

  const dup = await api("/api/v1/incentives/claims", {
    token: applicant,
    body: { schemeId: msme.id, unitId, requestedAmountInr: 4_000_000 },
  });
  ok(dup.status === 409 && dup.body.error.code === "CLAIM_IN_PROGRESS", "duplicate claim blocked (409)");

  // ── Lifecycle: SUBMITTED → UNDER_REVIEW → APPROVED → DISBURSED → UTILISED ──
  const nopeReview = await api(`/api/v1/incentives/claims/${claimId}/review`, { method: "POST", token: applicant });
  ok(nopeReview.status === 403, "applicant cannot review a claim (403)");

  const rv = await api(`/api/v1/incentives/claims/${claimId}/review`, { method: "POST", token: dept });
  ok(rv.status === 200 && rv.body.data.claim.status === "UNDER_REVIEW", "officer picked the claim up for review");

  const ap = await api(`/api/v1/incentives/claims/${claimId}/decide`, {
    token: dept,
    body: { approved: true, amountInr: 3_500_000, notes: "Sanctioned as per norms" },
  });
  ok(
    ap.status === 200 && ap.body.data.claim.status === "APPROVED" && ap.body.data.claim.approvedAmountInr === 3_500_000,
    "approved with a sanctioned amount",
  );

  const deptMoney = await api(`/api/v1/incentives/claims/${claimId}/disburse`, {
    token: dept,
    body: { reference: "UTR-X" },
  });
  ok(deptMoney.status === 403, "department desk cannot move money (403)");

  const ds = await api(`/api/v1/incentives/claims/${claimId}/disburse`, {
    token: state,
    body: { reference: `UTR-P8-${Date.now()}` },
  });
  ok(ds.status === 200 && ds.body.data.claim.status === "DISBURSED", "state admin disbursed the incentive");

  const officerUtil = await api(`/api/v1/incentives/claims/${claimId}/utilise`, {
    token: state,
    body: { notes: "nope" },
  });
  ok(officerUtil.status === 403, "officers cannot record utilisation (403)");

  const ut = await api(`/api/v1/incentives/claims/${claimId}/utilise`, {
    token: applicant,
    body: { notes: "Deployed towards power loom upgrade" },
  });
  ok(ut.status === 200 && ut.body.data.claim.status === "UTILISED", "unit recorded utilisation → UTILISED");

  const avail = await api("/api/v1/incentives/claims", {
    token: applicant,
    body: { schemeId: msme.id, unitId, requestedAmountInr: 1_000_000 },
  });
  ok(avail.status === 409 && avail.body.error.code === "CLAIM_ALREADY_AVAILED", "already-availed scheme blocked (409)");

  // ── Rejection path + re-apply ──
  const c2 = await api("/api/v1/incentives/claims", {
    token: applicant,
    body: { schemeId: skill.id, unitId, requestedAmountInr: 600_000 },
  });
  ok(c2.status === 201, `skill claim filed (${c2.status})`);
  const c2Id = c2.body.data.claim.id as string;
  await api(`/api/v1/incentives/claims/${c2Id}/review`, { method: "POST", token: dept });
  const rj = await api(`/api/v1/incentives/claims/${c2Id}/decide`, {
    token: dept,
    body: { approved: false, notes: "Training attendance records incomplete" },
  });
  ok(rj.status === 200 && rj.body.data.claim.status === "REJECTED", "claim rejected with notes");
  const retry = await api("/api/v1/incentives/claims", {
    token: applicant,
    body: { schemeId: skill.id, unitId, requestedAmountInr: 600_000, notes: "Re-filed with full records" },
  });
  ok(retry.status === 201, "rejection does not block re-applying (201)");

  // ── Timeline, action flags, queue scoping ──
  const detail = await api(`/api/v1/incentives/claims/${claimId}`, { token: applicant });
  const types = (detail.body.data.events as any[]).map((e) => e.eventType);
  ok(
    detail.status === 200 &&
      JSON.stringify(types) ===
        JSON.stringify(["CLAIM_SUBMITTED", "CLAIM_REVIEW_STARTED", "CLAIM_APPROVED", "CLAIM_DISBURSED", "CLAIM_UTILISED"]),
    "detail carries the full 5-step audit timeline",
  );
  ok(
    detail.body.data.can.review === false && detail.body.data.can.utilise === false,
    "no further actions on a UTILISED claim",
  );

  const queue = await api("/api/v1/incentives/claims", { token: dept });
  ok(queue.body.data.counts.UTILISED >= 1 && queue.body.data.counts.REJECTED >= 1, "officer queue counts populated");

  const mine = await api("/api/v1/incentives/claims", { token: applicant });
  const myUnits = await api("/api/v1/units", { token: applicant });
  const allowed = new Set((myUnits.body.data.items as any[]).map((u) => u.id));
  const myItems = mine.body.data.items as any[];
  ok(
    myItems.some((c) => c.id === claimId) && myItems.every((c) => allowed.has(c.unitId)),
    "applicant queue holds only claims from their own units",
  );

  const foreign = await login("demo-unit-user@sitara.test");
  const theirs = await api("/api/v1/incentives/claims", { token: foreign });
  ok(
    theirs.status === 200 && (theirs.body.data.items as any[]).length === 0,
    "a unit-less demo user sees an empty queue",
  );
  const theirCheck = await api(`/api/v1/incentives/schemes/${msme.id}/check`, {
    token: foreign,
    body: { unitId },
  });
  ok(theirCheck.status === 404, "foreign unit eligibility check refused (404)");

  const notifs = await api("/api/v1/notifications", { token: applicant });
  const titles = (notifs.body.data.items as any[]).map((x) => x.title);
  ok(titles.includes("Incentive disbursed") && titles.includes("Incentive claim rejected"), "notifications delivered");

  console.log(failed ? "\nLIVE E2E FAILED" : `\nLIVE E2E ALL GREEN (${n} checks)`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("E2E error:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
