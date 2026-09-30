// Phase 10 LIVE end-to-end against a running server: the full citizen
// journey (checklist → application → inspection → approvals → renewal →
// incentive → grievance) plus the security-hardening checks.
// 1) npm run dev   2) npm run db:seed:demo   3) npx tsx scripts/p10-e2e.ts
// Optional demo dataset: npm run db:seed:data
import { env } from "../src/config/env.js";
import { prisma } from "../src/utils/prisma.js";
import { wipeSeedData } from "./seed-demo-data.js";

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
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: string | FormData | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
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
  return { status: res.status, body: json, headers: res.headers };
}

async function login(email: string): Promise<string> {
  const r = await api("/api/v1/auth/login", { body: { email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${email} -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.data.accessToken as string;
}

/** Completes a draft (incl. renewal drafts): docs + form + submit. */
async function completeApplication(token: string, appId: string): Promise<void> {
  const detail = await api(`/api/v1/applications/${appId}`, { token });
  const at = detail.body.data.application.approvalType;
  for (const r of at.requirements) {
    const fd = new FormData();
    fd.append("file", new Blob([`%PDF p10 ${r.documentType.code}`], { type: "application/pdf" }), `${r.documentType.code}.pdf`);
    fd.append("documentType", r.documentType.code);
    const up = await api(`/api/v1/applications/${appId}/documents`, { token, body: fd });
    if (up.status !== 201) throw new Error(`upload ${r.documentType.code} -> ${up.status}`);
  }
  const formData: Record<string, unknown> = {};
  for (const f of at.formSchema) {
    if (f.required) formData[f.key] = f.type === "number" ? 5000 : f.options ? f.options[0] : "VALUE";
  }
  const form = await api(`/api/v1/applications/${appId}/form`, { method: "PUT", token, body: { formData } });
  if (form.status !== 200) throw new Error(`form -> ${form.status}`);
  const submit = await api(`/api/v1/applications/${appId}/submit`, { method: "POST", token });
  if (submit.status !== 200) throw new Error(`submit -> ${submit.status} ${JSON.stringify(submit.body).slice(0, 300)}`);
}

/** Drives the single ENV track of an MPCB_CTO-style application to approval. */
async function driveEnv(targetApp: string, envUser: string, approver: string): Promise<void> {
  const v1 = await api(`/api/v1/department/applications/${targetApp}`, { token: envUser });
  const step1 = (v1.body.data.application.workflowInstances as any[]).find(
    (i) => i.department.code === "ENV" && i.status === "ACTIVE",
  );
  const r1 = await api(`/api/v1/department/applications/${targetApp}/approve`, {
    token: envUser,
    body: { instanceId: step1.id, comment: "p10 e2e — compliance scrutiny" },
  });
  if (r1.status !== 200) throw new Error(`approve step1 -> ${r1.status} ${JSON.stringify(r1.body).slice(0, 300)}`);

  const v2 = await api(`/api/v1/department/applications/${targetApp}`, { token: approver });
  const step2 = (v2.body.data.application.workflowInstances as any[]).find(
    (i) => i.department.code === "ENV" && i.status === "ACTIVE",
  );
  const r2 = await api(`/api/v1/department/applications/${targetApp}/approve`, {
    token: approver,
    body: { instanceId: step2.id, comment: "p10 e2e — final consent" },
  });
  if (r2.status !== 200) throw new Error(`approve step2 -> ${r2.status} ${JSON.stringify(r2.body).slice(0, 300)}`);
}

/** Discovery-wizard answers for the walkthrough unit (the proven pharma fixture). */
const CONTEXT = {
  state: "Maharashtra",
  district: "Pune",
  industryType: "pharmaceuticals",
  establishmentType: "factory",
  employeeCount: 120,
  capitalInvestment: 25_000_000,
  pollution_relevant_activity: true,
  project_requires_environmental_clearance: true,
  consent_to_establish_obtained: true,
  existing_consent: true,
  building_or_industrial_activity_requires_fire_approval: true,
  clearance_type: ["environmental"],
};

async function main(): Promise<void> {
  const stamp = Date.now();

  // ── 0. Security hardening (Phase 10) ──
  const health = await api("/api/v1/health");
  ok(health.status === 200, "server health (no auth)");
  const noToken = await api("/api/v1/applications");
  ok(noToken.status === 401, "protected route without token -> 401");
  const badJson = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  ok(badJson.status === 400, "malformed JSON body -> 400");
  const hdrs = [...health.headers.keys()].map((k) => k.toLowerCase());
  ok(hdrs.some((k) => k.startsWith("ratelimit")), "rate-limit headers present");
  ok(hdrs.includes("x-content-type-options"), "helmet hardening headers present");

  // ── 1. Sign-ins (applicant + desks) ──
  const applicant = await login("demo-applicant@sitara.test");
  const envDesk = await login("demo-department_user-env@sitara.test");
  const envApprover = await login("demo-approving_authority-env@sitara.test");
  const indDesk = await login("demo-department_user-industry@sitara.test");
  const state = await login("demo-state_admin-industry@sitara.test");
  ok(true, "applicant / ENV desk / ENV approver / INDUSTRY desk / state admin signed in");

  const forbidden = await api("/api/v1/admin/ping", { token: applicant });
  ok(forbidden.status === 403, "applicant blocked from admin endpoint (403)");

  // ── 2. Knowledge engine -> personalised checklist ──
  const preview = await api("/api/v1/checklists/preview", {
    method: "POST",
    token: applicant,
    body: { context: CONTEXT },
  });
  const codes = ((preview.body.data?.applicableApprovals ?? []) as any[]).map((a) => a.approvalCode);
  ok(
    preview.status === 200 && codes.includes("MPCB_CTE") && codes.length >= 4,
    `engine returned ${codes.length} applicable approvals`,
  );

  const unitR = await api("/api/v1/units", {
    token: applicant,
    body: {
      name: `P10 Walkthrough Unit ${stamp}`,
      industryType: "pharmaceuticals",
      sector: "Pharmaceuticals",
      state: "Maharashtra",
      district: "Pune",
      employeeCount: 120,
      capitalInvestment: 25_000_000,
    },
  });
  ok(unitR.status === 201, `unit created (${unitR.status})`);
  const unitId = unitR.body.data.unit.id as string;

  const clR = await api("/api/v1/checklists", {
    method: "POST",
    token: applicant,
    body: { unitId, name: `P10 walkthrough checklist ${stamp}`, context: CONTEXT },
  });
  ok(clR.status === 201, `checklist saved (${clR.status})`);
  const checklist = clR.body.data.checklist;
  const items = checklist.items as any[];
  ok(items.length >= 4, `${items.length} checklist items generated`);

  // ── 3. Guided application -> pre-validated submission ──
  const create = await api("/api/v1/applications", {
    token: applicant,
    body: { unitId, approvalTypeCode: "MPCB_CTE", checklistItemId: items[0].id },
  });
  ok(create.status === 201, `application created (${create.body.data.application.applicationNo})`);
  const appId = create.body.data.application.id as string;

  await completeApplication(applicant, appId);
  const submitted = await api(`/api/v1/applications/${appId}`, { token: applicant });
  ok(
    submitted.body.data.application.status === "UNDER_SCRUTINY",
    "submitted -> UNDER_SCRUTINY (docs + form pre-validated)",
  );

  // ── 4. Parallel departmental workflows (ENV + INDUSTRY fan-out) ──
  const view0 = await api(`/api/v1/department/applications/${appId}`, { token: envDesk });
  const instances = view0.body.data.application.workflowInstances as any[];
  ok(instances.length === 2, `fanned out to ${instances.length} parallel tracks`);
  const envInst = instances.find((i) => i.department.code === "ENV");
  const indInst = instances.find((i) => i.department.code === "INDUSTRY");
  ok(Boolean(envInst && indInst), "ENV and INDUSTRY tracks both active");
  ok(
    Boolean(envInst?.slaDueAt) && Boolean(indInst?.slaDueAt),
    "SLA deadlines stamped on both tracks",
  );

  const inbox = await api("/api/v1/department/inbox", { token: envDesk });
  const inInbox = (inbox.body.data.items as any[]).some((i) => i.application?.id === appId);
  ok(inbox.status === 200 && inInbox, "application appears in the ENV desk inbox");

  // ── 5. Query loop: ENV raises a query, applicant responds, track resumes ──
  const q = await api(`/api/v1/department/applications/${appId}/query`, {
    method: "POST",
    token: envDesk,
    body: { instanceId: envInst.id, question: "Please upload the latest consent fee receipt." },
  });
  ok(q.status === 200, "department raised a query");
  const qView = await api(`/api/v1/applications/${appId}`, { token: applicant });
  ok(qView.body.data.application.status === "QUERY", "application parked in QUERY");

  const respond = await api(`/api/v1/applications/${appId}/query-response`, {
    method: "POST",
    token: applicant,
    body: { response: "Receipt attached — application number RCPT-2026-0451." },
  });
  ok(respond.status === 200 && respond.body.data.status === "UNDER_SCRUTINY", "applicant responded -> scrutiny resumed");

  // ── 6. Risk-based scrutiny ──
  const risk = await api(`/api/v1/inspections/risk/${appId}`, { token: state });
  const assessment = risk.body.data.assessment;
  ok(risk.status === 200 && typeof assessment.score === "number", `risk scored ${assessment.category} (${assessment.score})`);
  ok(
    assessment.scrutinyLevel === "PHYSICAL" && assessment.requiresInspection === true,
    "high-risk pharma project -> PHYSICAL scrutiny",
  );

  // ── 7. Common joint inspection planning ──
  const plan = await api("/api/v1/inspections", {
    method: "POST",
    token: state,
    body: {
      applicationId: appId,
      scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      venue: "P10 Walkthrough Plant, Chakan MIDC, Pune",
    },
  });
  ok(plan.status === 201, `joint inspection planned (${plan.status})`);
  const inspectionId = plan.body.data.inspection.id as string;
  const participants = plan.body.data.inspection.participants as any[];
  const visitDepts = participants.map((p) => p.department.code).sort().join(",");
  ok(visitDepts === "ENV,INDUSTRY", `one visit covers [${visitDepts}]`);

  const dir = await api("/api/v1/inspections/inspectors", { token: state });
  const pick = (email: string) =>
    (dir.body.data.items as any[]).find((i) => i.email === email)?.id as string | undefined;
  const envInspId = pick("demo-inspector-env@sitara.test");
  const indInspId = pick("demo-inspector-industry@sitara.test");
  ok(Boolean(envInspId && indInspId), "per-department inspectors found in directory");

  const envP = participants.find((p) => p.department.code === "ENV");
  const indP = participants.find((p) => p.department.code === "INDUSTRY");
  const a1 = await api(`/api/v1/inspections/${inspectionId}/assign`, {
    method: "POST",
    token: state,
    body: { participantId: envP.id, inspectorId: envInspId },
  });
  const a2 = await api(`/api/v1/inspections/${inspectionId}/assign`, {
    method: "POST",
    token: state,
    body: { participantId: indP.id, inspectorId: indInspId },
  });
  ok(a1.status === 200 && a2.status === 200, "inspectors assigned to both departments");

  const envInspTok = await login("demo-inspector-env@sitara.test");
  const indInspTok = await login("demo-inspector-industry@sitara.test");
  const start = await api(`/api/v1/inspections/${inspectionId}/start`, {
    method: "POST",
    token: envInspTok,
  });
  ok(start.status === 200 && start.body.data.status === "IN_PROGRESS", "visit started by assigned inspector");

  const o1 = await api(`/api/v1/inspections/${inspectionId}/observation`, {
    method: "POST",
    token: envInspTok,
    body: { participantId: envP.id, compliant: true, notes: "ETP operational; consent conditions verified on site." },
  });
  const o2 = await api(`/api/v1/inspections/${inspectionId}/observation`, {
    method: "POST",
    token: indInspTok,
    body: { participantId: indP.id, compliant: true, notes: "Labour registrations and muster rolls in order." },
  });
  ok(o1.status === 201 && o2.status === 201, "both departments filed observations");

  const done = await api(`/api/v1/inspections/${inspectionId}/complete`, {
    method: "POST",
    token: state,
    body: { findings: "Joint visit satisfactory — no objections.", complianceStatus: "COMPLIANT" },
  });
  ok(done.status === 200, "inspection completed with consolidated report");

  // ── 8. Approvals: ENV two-step consent + INDUSTRY verification ──
  await driveEnv(appId, envDesk, envApprover);
  const vInd = await api(`/api/v1/department/applications/${appId}`, { token: envDesk });
  const indActive = (vInd.body.data.application.workflowInstances as any[]).find(
    (i) => i.department.code === "INDUSTRY" && i.status === "ACTIVE",
  );
  const indOk = await api(`/api/v1/department/applications/${appId}/approve`, {
    method: "POST",
    token: indDesk,
    body: { instanceId: indActive.id, comment: "P10 e2e — UDYAM & registration verified" },
  });
  ok(indOk.status === 200, "INDUSTRY track cleared");

  const applicantView = await api(`/api/v1/applications/${appId}`, { token: applicant });
  const appAfter = applicantView.body.data.application;
  ok(appAfter.status === "APPROVED", "application APPROVED after both tracks cleared");
  const approval = (appAfter.approvals as any[])[0];
  ok(Boolean(approval?.approvalNo), `approval issued (${approval?.approvalNo})`);
  const eventTypes = (appAfter.events as any[]).map((e) => e.eventType);
  ok(
    eventTypes.includes("QUERY_RAISED") && eventTypes.includes("QUERY_RESPONDED"),
    "query round-trip recorded in the audit trail",
  );

  // ── 9. Renewal surface: due list + readiness for the fresh approval ──
  const due = await api("/api/v1/renewals/due", { token: applicant });
  ok(due.status === 200 && Array.isArray(due.body.data.items), "renewal due-list loads");
  const ready = await api(`/api/v1/renewals/${approval.id}`, { token: applicant });
  const readiness = ready.body.data?.readiness;
  ok(
    ready.status === 200 && readiness?.canRenew === true && readiness.blockers.length === 0,
    "renewal readiness: no blockers",
  );
  const sweep = await api("/api/v1/renewals/sweep", { method: "POST", token: state });
  ok(sweep.status === 200, "expiry/alert sweep runs on demand");

  // ── 10. Incentives: eligibility -> claim -> sanctions -> utilisation ──
  const cat = await api(`/api/v1/incentives/schemes?unitId=${unitId}`, { token: applicant });
  const msme = ((cat.body.data.items as any[]) ?? []).find(
    (s) => s.code === "MSME_CAPITAL_SUBSIDY_001",
  );
  ok(cat.status === 200 && msme?.eligibility?.eligible === true, "unit matches the MSME capital subsidy");
  const chk = await api(`/api/v1/incentives/schemes/${msme.id}/check`, {
    method: "POST",
    token: applicant,
    body: { unitId },
  });
  ok(
    chk.status === 200 && (chk.body.data.eligibility.checks as any[]).every((c) => c.passed),
    "dry-run eligibility: every check passes",
  );

  const claim = await api("/api/v1/incentives/claims", {
    method: "POST",
    token: applicant,
    body: { schemeId: msme.id, unitId, requestedAmountInr: 4_000_000, notes: "P10 e2e — machinery upgrade" },
  });
  ok(claim.status === 201 && claim.body.data.claim.status === "SUBMITTED", "claim filed");
  const claimId = claim.body.data.claim.id as string;
  const rv = await api(`/api/v1/incentives/claims/${claimId}/review`, { method: "POST", token: envDesk });
  ok(rv.status === 200 && rv.body.data.claim.status === "UNDER_REVIEW", "officer picked the claim up");
  const ap = await api(`/api/v1/incentives/claims/${claimId}/decide`, {
    method: "POST",
    token: envDesk,
    body: { approved: true, amountInr: 3_500_000, notes: "Sanctioned as per MSME norms" },
  });
  ok(ap.status === 200 && ap.body.data.claim.status === "APPROVED", "claim sanctioned with an amount");
  const ds = await api(`/api/v1/incentives/claims/${claimId}/disburse`, {
    method: "POST",
    token: state,
    body: { reference: `UTR-P10-${stamp}` },
  });
  ok(ds.status === 200 && ds.body.data.claim.status === "DISBURSED", "state disbursed the incentive");
  const ut = await api(`/api/v1/incentives/claims/${claimId}/utilise`, {
    method: "POST",
    token: applicant,
    body: { notes: "Deployed towards the new granulation line" },
  });
  ok(ut.status === 200 && ut.body.data.claim.status === "UTILISED", "unit recorded utilisation -> UTILISED");

  // ── 11. Grievance: file -> acknowledge -> respond -> resolve ──
  const g = await api("/api/v1/grievances", {
    method: "POST",
    token: applicant,
    body: {
      subject: "P10 e2e — inspection reschedule request",
      description: "Please move the joint inspection to the following week; plant maintenance is under way.",
      category: "SERVICE_DELAY",
      priority: "MEDIUM",
      unitId,
    },
  });
  ok(
    g.status === 201 && /^GRV-\d{8}-[0-9A-F]{4}$/.test(g.body.data.grievance.referenceNo),
    `grievance filed (${g.body.data.grievance?.referenceNo})`,
  );
  const gid = g.body.data.grievance.id as string;
  const ack = await api(`/api/v1/grievances/${gid}/acknowledge`, { method: "POST", token: state });
  ok(ack.status === 200 && ack.body.data.grievance.status === "IN_PROGRESS", "grievance acknowledged");
  const gr = await api(`/api/v1/grievances/${gid}/respond`, {
    method: "POST",
    token: state,
    body: { notes: "Rescheduled — the unit will receive the new slot shortly." },
  });
  ok(gr.status === 200, "response recorded for the filer");
  const grv = await api(`/api/v1/grievances/${gid}/resolve`, {
    method: "POST",
    token: state,
    body: { accepted: true, notes: "Visit moved to next week; unit informed." },
  });
  ok(grv.status === 200 && grv.body.data.grievance.status === "RESOLVED", "grievance resolved");

  // ── 12. Analytics, alerts and notifications ──
  const ov = await api("/api/v1/analytics/overview", { token: state });
  ok(ov.status === 200 && Boolean(ov.body.data), "analytics overview loads");
  const al = await api("/api/v1/analytics/alerts", { token: state });
  ok(
    al.status === 200 && Array.isArray(al.body.data.items),
    `alert feed ranked (${(al.body.data.items as any[]).length} items)`,
  );
  const notifs = await api("/api/v1/notifications", { token: applicant });
  const ntypes = (notifs.body.data.items as any[]).map((i) => i.type);
  ok(
    notifs.status === 200 && ntypes.includes("QUERY") && ntypes.includes("INSPECTION"),
    "applicant notified for queries and inspections",
  );

  // ── 13. SLA watchdog ──
  const sla = await api("/api/v1/department/sla/run", { method: "POST", token: state });
  ok(sla.status === 200, "SLA pass ran (escalation sweep)");

  // ── 14. Cleanup — the demo dataset (npm run db:seed:data) is untouched ──
  try {
    await wipeSeedData(unitId);
    await prisma.unit.delete({ where: { id: unitId } });
    ok(true, "walkthrough unit and its records wiped");
  } catch (err) {
    ok(false, `cleanup failed — ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`\n${failed ? "FAILURES detected" : "LIVE E2E ALL GREEN"} — ${n} checks\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nE2E aborted:", err instanceof Error ? err.message : err);
  process.exit(1);
});

