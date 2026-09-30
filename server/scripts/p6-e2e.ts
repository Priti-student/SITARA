// Phase 6 LIVE end-to-end against a running server.
// 1) npm run dev   2) npm run db:seed:demo   3) npx tsx scripts/p6-e2e.ts
import { env } from "../src/config/env.js";

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

async function main(): Promise<void> {
  const health = await api("/api/v1/health");
  ok(health.status === 200, "server health");

  // ── Applicant: unit → RED checklist → checklist-linked app → submit ──
  const applicant = await login("demo-applicant@sitara.test");
  ok(true, "applicant signed in");

  const unit = await api("/api/v1/units", {
    token: applicant,
    body: {
      name: `P6 Live Unit ${Date.now()}`,
      industryType: "pharmaceuticals",
      sector: "Pharmaceuticals",
      state: "Maharashtra",
      district: "Pune",
      employeeCount: 120,
      capitalInvestment: 150_000_000,
    },
  });
  ok(unit.status === 201, `unit created (${unit.status})`);
  const unitId = unit.body.data.unit.id as string;

  const cl = await api("/api/v1/checklists", {
    token: applicant,
    body: { unitId, name: `P6 live checklist ${Date.now()}`, context: PHARMA_CONTEXT },
  });
  ok(cl.status === 201 && cl.body.data.checklist.riskCategory === "RED", "RED checklist created");

  const create = await api("/api/v1/applications", {
    token: applicant,
    body: { unitId, approvalTypeCode: "MPCB_CTE", checklistItemId: cl.body.data.checklist.items[0].id },
  });
  ok(create.status === 201, `application created (${create.status})`);
  const appId = create.body.data.application.id as string;
  ok(create.body.data.application.riskCategory === "RED", "risk category RED copied onto application");

  const detail = await api(`/api/v1/applications/${appId}`, { token: applicant });
  const at = detail.body.data.application.approvalType;
  for (const r of at.requirements) {
    const fd = new FormData();
    fd.append("file", new Blob([`%PDF p6 ${r.documentType.code}`], { type: "application/pdf" }), `${r.documentType.code}.pdf`);
    fd.append("documentType", r.documentType.code);
    const up = await api(`/api/v1/applications/${appId}/documents`, { token: applicant, body: fd });
    if (up.status !== 201) throw new Error(`upload ${r.documentType.code} -> ${up.status}`);
  }
  const formData: Record<string, unknown> = {};
  for (const f of at.formSchema) {
    if (f.required) formData[f.key] = f.type === "number" ? 5000 : f.options ? f.options[0] : "VALUE";
  }
  const form = await api(`/api/v1/applications/${appId}/form`, { method: "PUT", token: applicant, body: { formData } });
  ok(form.status === 200, `form filled (${form.status})`);

  const submit = await api(`/api/v1/applications/${appId}/submit`, { method: "POST", token: applicant });
  if (submit.status !== 200) console.log(`   submit resp: ${submit.status} ${JSON.stringify(submit.body).slice(0, 400)}`);
  ok(submit.status === 200 && submit.body.data.application.status === "UNDER_SCRUTINY", "submitted → UNDER_SCRUTINY");
  if (submit.status !== 200) throw new Error("stopping: submit failed");

  // ── Risk-based scrutiny: state admin scores the application ──
  const state = await login("demo-state_admin-industry@sitara.test");
  const risk1 = await api(`/api/v1/inspections/risk/${appId}`, { token: state });
  const assessment = risk1.body.data.assessment;
  ok(risk1.status === 200 && assessment.category === "HIGH", `risk HIGH (score ${assessment.score})`);
  ok(assessment.scrutinyLevel === "PHYSICAL" && assessment.requiresInspection === true, "scrutiny level PHYSICAL → inspection expected");
  const baseScore = assessment.score as number;

  // ── Plan the joint inspection (departments default from workflow tracks) ──
  const plan = await api("/api/v1/inspections", {
    token: state,
    body: { applicationId: appId, scheduledAt: new Date(Date.now() + 86400000).toISOString(), venue: "P6 Live Plant, Chakan MIDC" },
  });
  ok(plan.status === 201, `joint inspection planned (${plan.status})`);
  const inspectionId = plan.body.data.inspection.id as string;
  const depts = (plan.body.data.inspection.participants as any[]).map((p) => p.department.code).sort().join(",");
  ok(depts === "ENV,INDUSTRY", `two departments on one visit (${depts})`);
  ok(plan.body.data.inspection.riskScoreAtScheduling === baseScore, "risk score snapshotted at planning");
  const envP = (plan.body.data.inspection.participants as any[]).find((p) => p.department.code === "ENV");
  const indP = (plan.body.data.inspection.participants as any[]).find((p) => p.department.code === "INDUSTRY");

  const dup = await api("/api/v1/inspections", { token: state, body: { applicationId: appId, scheduledAt: new Date(Date.now() + 172800000).toISOString() } });
  ok(dup.status === 409, "duplicate open plan blocked (409)");

  // ── Applicant sees the schedule + notification ──
  const appView = await api(`/api/v1/applications/${appId}`, { token: applicant });
  ok((appView.body.data.application.inspections ?? []).length === 1, "applicant sees the inspection on the application");
  const notifs = await api("/api/v1/notifications", { token: applicant });
  ok((notifs.body.data.items as any[]).some((i) => i.type === "INSPECTION"), "applicant got INSPECTION notification");

  // ── Assign one inspector per department ──
  const dir = await api("/api/v1/inspections/inspectors", { token: state });
  const pick = (email: string) => (dir.body.data.items as any[]).find((i) => i.email === email)?.id;
  const envInsp = pick("demo-inspector-env@sitara.test");
  const indInsp = pick("demo-inspector-industry@sitara.test");
  ok(Boolean(envInsp && indInsp), "per-department inspectors found in directory");
  const s1 = await api(`/api/v1/inspections/${inspectionId}/assign`, { token: state, body: { participantId: envP.id, inspectorId: envInsp } });
  const s2 = await api(`/api/v1/inspections/${inspectionId}/assign`, { token: state, body: { participantId: indP.id, inspectorId: indInsp } });
  ok(s1.status === 200 && s2.status === 200, "inspectors assigned to both departments");

  // ── Execution: start, file observations, complete ──
  const envUser = await login("demo-inspector-env@sitara.test");
  const wrong = await api(`/api/v1/inspections/${inspectionId}/start`, { method: "POST", token: await login("demo-inspector@sitara.test") });
  if (wrong.status !== 403) console.log(`   wrong start resp: ${wrong.status} ${JSON.stringify(wrong.body).slice(0, 300)}`);
  ok(wrong.status === 403, "unassigned inspector cannot start (403)");
  const start = await api(`/api/v1/inspections/${inspectionId}/start`, { method: "POST", token: envUser });
  if (start.status !== 200) console.log(`   start resp: ${start.status} ${JSON.stringify(start.body).slice(0, 300)}`);
  ok(start.status === 200 && start.body.data.status === "IN_PROGRESS", "visit started by assigned inspector");

  const indUser = await login("demo-inspector-industry@sitara.test");
  const o1 = await api(`/api/v1/inspections/${inspectionId}/observation`, {
    token: indUser,
    body: { compliant: true, notes: "Labour registrations verified" },
  });
  const o2 = await api(`/api/v1/inspections/${inspectionId}/observation`, {
    token: envUser,
    body: { compliant: false, notes: "Effluent treatment plant not yet commissioned" },
  });
  if (o1.status !== 201) console.log(`   o1 resp: ${o1.status} ${JSON.stringify(o1.body).slice(0, 300)}`);
  if (o2.status !== 201) console.log(`   o2 resp: ${o2.status} ${JSON.stringify(o2.body).slice(0, 300)}`);
  ok(o1.status === 201 && o2.status === 201, "both departments filed observations");

  const done = await api(`/api/v1/inspections/${inspectionId}/complete`, {
    token: state,
    body: { findings: "Joint visit: ETP commissioning pending; labour records in order.", complianceStatus: "NON_COMPLIANT" },
  });
  if (done.status !== 200) console.log(`   complete resp: ${done.status} ${JSON.stringify(done.body).slice(0, 300)}`);
  ok(done.status === 200, "inspection completed with consolidated report");

  const detail2 = await api(`/api/v1/inspections/${inspectionId}`, { token: state });
  const insp = detail2.body.data.inspection;
  ok(insp.status === "COMPLETED" && insp.complianceStatus === "NON_COMPLIANT", `completed as ${insp.complianceStatus}`);
  ok(insp.observations.length === 2, "two department observations recorded");
  const evTypes = (insp.events as any[]).map((e) => e.eventType);
  ok(evTypes.includes("INSPECTION_SCHEDULED") && evTypes.includes("INSPECTION_COMPLETED"), "audit trail recorded on the application");

  // ── Non-compliance lifts the risk score ──
  const risk2 = await api(`/api/v1/inspections/risk/${appId}`, { token: state });
  ok(risk2.body.data.assessment.score > baseScore, `risk rose after non-compliance (${baseScore} → ${risk2.body.data.assessment.score})`);

  // ── Cancel flow ──
  const plan2 = await api("/api/v1/inspections", {
    token: state,
    body: { applicationId: appId, scheduledAt: new Date(Date.now() + 259200000).toISOString() },
  });
  if (plan2.status !== 201) console.log(`   plan2 resp: ${plan2.status} ${JSON.stringify(plan2.body).slice(0, 300)}`);
  ok(plan2.status === 201, "second inspection planned after the first closed");
  const plan2Id = plan2.body?.data?.inspection?.id as string | undefined;
  const cancel = plan2Id
    ? await api(`/api/v1/inspections/${plan2Id}/cancel`, {
        token: state,
        body: { reason: "Unit requested rescheduling" },
      })
    : { status: 0, body: {} };
  ok(cancel.status === 200, "inspection cancelled");

  console.log(failed ? "\nLIVE E2E FAILED" : "\nLIVE E2E ALL GREEN");
  if (failed) process.exitCode = 1;

}

main().catch((err) => {
  console.error("E2E error:", err);
  process.exit(1);
});
