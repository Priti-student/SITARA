// Phase 7 LIVE end-to-end against a running server.
// 1) npm run dev   2) npm run db:seed:demo   3) npx tsx scripts/p7-e2e.ts
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
  return { status: res.status, body: json };
}

async function login(email: string): Promise<string> {
  const r = await api("/api/v1/auth/login", { body: { email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${email} -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.data.accessToken as string;
}

/** Completes an application (renewal draft included): docs + form + submit. */
async function completeApplication(token: string, appId: string): Promise<void> {
  const detail = await api(`/api/v1/applications/${appId}`, { token });
  const at = detail.body.data.application.approvalType;
  for (const r of at.requirements) {
    const fd = new FormData();
    fd.append("file", new Blob([`%PDF p7 ${r.documentType.code}`], { type: "application/pdf" }), `${r.documentType.code}.pdf`);
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
  if (submit.status !== 200) throw new Error(`submit -> ${submit.status}`);
}

/** Drives the single ENV track of MPCB_CTO/MPCB_CTO_REN to full approval. */
async function driveEnv(targetApp: string, envUser: string, approver: string): Promise<void> {
  const v1 = await api(`/api/v1/department/applications/${targetApp}`, { token: envUser });
  const step1 = (v1.body.data.application.workflowInstances as any[]).find((i) => i.department.code === "ENV");
  const r1 = await api(`/api/v1/department/applications/${targetApp}/approve`, { token: envUser, body: { instanceId: step1.id, comment: "p7 e2e step 1" } });
  if (r1.status !== 200) throw new Error(`approve step1 -> ${r1.status} ${JSON.stringify(r1.body).slice(0, 300)}`);
  const v2 = await api(`/api/v1/department/applications/${targetApp}`, { token: envUser });
  const step2 = (v2.body.data.application.workflowInstances as any[]).find((i) => i.department.code === "ENV");
  const r2 = await api(`/api/v1/department/applications/${targetApp}/approve`, { token: approver, body: { instanceId: step2.id, comment: "p7 e2e final consent" } });
  if (r2.status !== 200) throw new Error(`approve step2 -> ${r2.status} ${JSON.stringify(r2.body).slice(0, 300)}`);
}

async function main(): Promise<void> {
  const health = await api("/api/v1/health");
  ok(health.status === 200, "server health");

  const applicant = await login("demo-applicant@sitara.test");
  const envUser = await login("demo-department_user-env@sitara.test");
  const approver = await login("demo-approving_authority-env@sitara.test");
  const state = await login("demo-state_admin-industry@sitara.test");
  ok(true, "applicant / ENV desk / ENV approver / state admin signed in");

  // ── Unit + CTO application (pre-operation, validity 365 days) ──
  const unit = await api("/api/v1/units", {
    token: applicant,
    body: {
      name: `P7 Live Unit ${Date.now()}`,
      industryType: "pharmaceuticals",
      sector: "Pharmaceuticals",
      state: "Maharashtra",
      district: "Pune",
      employeeCount: 90,
      capitalInvestment: 90_000_000,
    },
  });
  ok(unit.status === 201, `unit created (${unit.status})`);
  const unitId = unit.body.data.unit.id as string;

  const create = await api("/api/v1/applications", {
    token: applicant,
    body: { unitId, approvalTypeCode: "MPCB_CTO" },
  });
  ok(create.status === 201, `CTO application created (${create.status})`);
  const appId = create.body.data.application.id as string;

  await completeApplication(applicant, appId);
  await driveEnv(appId, envUser, approver);
  const view = await api(`/api/v1/department/applications/${appId}`, { token: envUser });
  ok(view.body.data.application.status === "APPROVED", "CTO application approved");
  const approval = view.body.data.application.approvals[0];
  ok(Boolean(approval), "approval issued");
  const approvalId = approval.id as string;
  const approvalNo = approval.approvalNo as string;
  ok(approval.status === "ACTIVE" && approval.renewalCount === 0, `approval ACTIVE, first issue (${approvalNo})`);

  // ── Renewal monitoring: due list + readiness ──
  const due = await api("/api/v1/renewals/due?days=400", { token: applicant });
  ok(due.status === 200, `due renewals listed (${due.status})`);
  const dueRow = (due.body.data.items as any[]).find((a) => a.id === approvalId);
  ok(Boolean(dueRow), "our approval appears in the due list");
  ok(dueRow?.state === "CURRENT" && dueRow?.daysLeft > 300, `countdown live (${dueRow?.daysLeft} days left)`);

  const foreign = await login("demo-unit-user@sitara.test");
  const scoped = await api("/api/v1/renewals/due?days=400", { token: foreign });
  ok(scoped.status === 200 && !(scoped.body.data.items as any[]).some((a) => a.id === approvalId), "other users don't see our approvals");

  const ready0 = await api(`/api/v1/renewals/${approvalId}`, { token: applicant });
  ok(ready0.status === 200 && ready0.body.data.readiness.canRenew === true, "readiness: canRenew with no blockers");

  // ── Inspection verdict auto-opens a compliance case ──
  const plan = await api("/api/v1/inspections", {
    token: state,
    body: { applicationId: appId, scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(), departmentCodes: ["ENV"], title: "P7 live compliance visit" },
  });
  ok(plan.status === 201, `inspection planned (${plan.status})`);
  const inspectionId = plan.body.data.inspection.id as string;
  const start = await api(`/api/v1/inspections/${inspectionId}/start`, { method: "POST", token: state });
  ok(start.status === 200, "inspection started");
  const done = await api(`/api/v1/inspections/${inspectionId}/complete`, {
    token: state,
    body: { findings: "Online effluent monitoring not reporting to the board", complianceStatus: "NON_COMPLIANT" },
  });
  ok(done.status === 200, "inspection completed NON_COMPLIANT");

  const cases = await api("/api/v1/compliance", { token: applicant });
  ok(cases.status === 200, `compliance cases listed (${cases.status})`);
  const c = (cases.body.data.items as any[]).find((x) => x.inspection?.id === inspectionId);
  ok(Boolean(c), "compliance case auto-opened from the verdict");
  const caseId = c?.id as string;
  ok(c?.status === "OPEN" && c?.severity === "NON_COMPLIANT", "case OPEN / NON_COMPLIANT");
  ok(cases.body.data.counts.OPEN >= 1, `status counts aggregate (open=${cases.body.data.counts.OPEN})`);

  const unitStatus = await api(`/api/v1/compliance/units/${unitId}`, { token: applicant });
  ok(unitStatus.body.data.status === "NON_COMPLIANT", "unit compliance status = NON_COMPLIANT");

  const ready1 = await api(`/api/v1/renewals/${approvalId}`, { token: applicant });
  ok(ready1.body.data.readiness.canRenew === false, "readiness blocked by open case");
  ok(ready1.body.data.readiness.blockers[0]?.code === "OPEN_COMPLIANCE_CASE", "blocker code OPEN_COMPLIANCE_CASE");
  const blocked = await api("/api/v1/renewals", { token: applicant, body: { approvalId } });
  ok(blocked.status === 409 && blocked.body.error.code === "OPEN_COMPLIANCE_CASE", `renewal create blocked (${blocked.status})`);

  // ── Remediation loop: file → reject (reopen) → file → accept ──
  const rem1 = await api(`/api/v1/compliance/${caseId}/remediate`, {
    token: applicant,
    body: { notes: "DEM send-uplink configured; commissioning report attached" },
  });
  ok(rem1.status === 200 && rem1.body.data.case.status === "REMEDIATED", "remediation submitted");
  const rej = await api(`/api/v1/compliance/${caseId}/resolve`, {
    token: state,
    body: { accepted: false, notes: "Calibration certificates missing" },
  });
  ok(rej.status === 200 && rej.body.data.case.status === "OPEN", "officer rejected → case reopened");
  const rem2 = await api(`/api/v1/compliance/${caseId}/remediate`, {
    token: applicant,
    body: { notes: "Calibration certificates uploaded" },
  });
  ok(rem2.status === 200, "remediation resubmitted");
  const res = await api(`/api/v1/compliance/${caseId}/resolve`, {
    token: state,
    body: { accepted: true, notes: "Verified — DEM reporting confirmed" },
  });
  ok(res.status === 200 && res.body.data.case.status === "RESOLVED", "remediation accepted → case RESOLVED");
  const unitOk = await api(`/api/v1/compliance/units/${unitId}`, { token: applicant });
  ok(unitOk.body.data.status === "REMEDIATED" && unitOk.body.data.openCases === 0, "unit status → REMEDIATED");

  // ── Renewal: draft (prefilled) → duplicate blocked → workflow clears ──
  const ready2 = await api(`/api/v1/renewals/${approvalId}`, { token: applicant });
  ok(ready2.body.data.readiness.canRenew === true, "readiness restored after resolution");
  const draft = await api("/api/v1/renewals", { token: applicant, body: { approvalId } });
  ok(draft.status === 201, `renewal draft created (${draft.status})`);
  const draftId = draft.body.data.application.id as string;
  ok(draft.body.data.application.linkedApprovalId === approvalId, "draft linked to its approval");
  const dup = await api("/api/v1/renewals", { token: applicant, body: { approvalId } });
  ok(dup.status === 409 && dup.body.error.code === "RENEWAL_PENDING", "duplicate renewal blocked (409)");

  await completeApplication(applicant, draftId);
  await driveEnv(draftId, envUser, approver);
  const view2 = await api(`/api/v1/department/applications/${draftId}`, { token: envUser });
  ok(view2.body.data.application.status === "APPROVED", "renewal application approved");
  const renewed = await prisma.approval.findUnique({ where: { id: approvalId } });
  ok(renewed?.renewalCount === 1 && renewed?.renewedAt !== null, "renewalCount → 1, renewedAt stamped");
  ok(renewed?.status === "ACTIVE" && renewed?.approvalNo === approvalNo, "same certificate renewed (number unchanged)");
  const ready3 = await api(`/api/v1/renewals/${approvalId}`, { token: applicant });
  ok(ready3.body.data.readiness.state === "CURRENT", "renewed validity is CURRENT again");

  // ── Sweep: lapse + one pre-expiry alert per cycle ──
  await prisma.approval.update({
    where: { id: approvalId },
    data: { status: "ACTIVE", validTill: new Date(Date.now() - 86400000), renewalAlertAt: null },
  });
  const sweep1 = await api("/api/v1/renewals/sweep", { method: "POST", token: state });
  ok(sweep1.status === 200 && sweep1.body.data.expired >= 1, `sweep ran (expired=${sweep1.body.data.expired})`);
  const lapsed = await prisma.approval.findUnique({ where: { id: approvalId } });
  ok(lapsed?.status === "EXPIRED", "past-validity approval lapsed to EXPIRED");

  await prisma.approval.update({
    where: { id: approvalId },
    data: { status: "ACTIVE", validTill: new Date(Date.now() + 10 * 86400000), renewalAlertAt: null },
  });
  const applicantRow = await prisma.user.findUnique({
    where: { email: "demo-applicant@sitara.test" },
    select: { id: true },
  });
  const alertCount = async () =>
    prisma.notification.count({ where: { userId: applicantRow!.id, type: "RENEWAL", title: "Renewal due soon" } });
  const before = await alertCount();
  await api("/api/v1/renewals/sweep", { method: "POST", token: state });
  ok((await alertCount()) > before, "pre-expiry alert sent once");
  const after1 = await alertCount();
  await api("/api/v1/renewals/sweep", { method: "POST", token: state });
  ok((await alertCount()) === after1, "second sweep sends no duplicate alert");
  const denied = await api("/api/v1/renewals/sweep", { method: "POST", token: applicant });
  ok(denied.status === 403, "sweep is officer-only (403)");

  // Leave the live approval healthy for the demo environment.
  await prisma.approval.update({
    where: { id: approvalId },
    data: { status: "ACTIVE", validTill: new Date(Date.now() + 365 * 86400000), renewalAlertAt: null },
  });

  console.log(failed ? "\nLIVE E2E FAILED" : `\nLIVE E2E ALL GREEN (${n} checks)`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("E2E error:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
