// Phase 5 LIVE end-to-end against a running server.
// 1) npm run dev   2) npx tsx scripts/p5-e2e.ts   (uses DEMO_USER_PASSWORD)
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
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
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

  // ── Applicant: unit → application → documents → form → submit ──
  const applicant = await login("demo-applicant@sitara.test");
  ok(true, "applicant signed in");

  const unit = await api("/api/v1/units", {
    token: applicant,
    body: {
      name: `P5 Live Unit ${Date.now()}`,
      industryType: "pharmaceuticals",
      sector: "Pharmaceuticals",
      state: "Maharashtra",
      district: "Pune",
      employeeCount: 60,
      capitalInvestment: 40_000_000,
    },
  });
  ok(unit.status === 201, `unit created (${unit.status})`);
  const unitId = unit.body.data.unit.id as string;

  const create = await api("/api/v1/applications", {
    token: applicant,
    body: { unitId, approvalTypeCode: "MPCB_CTE" },
  });
  ok(create.status === 201, `application created (${create.status})`);
  const appId = create.body.data.application.id as string;

  const detail = await api(`/api/v1/applications/${appId}`, { token: applicant });
  const at = detail.body.data.application.approvalType;
  for (const r of at.requirements) {
    const fd = new FormData();
    fd.append("file", new Blob([`%PDF live ${r.documentType.code}`], { type: "application/pdf" }), `${r.documentType.code}.pdf`);
    fd.append("documentType", r.documentType.code);
    const up = await api(`/api/v1/applications/${appId}/documents`, { token: applicant, body: fd });
    if (up.status !== 201) throw new Error(`upload ${r.documentType.code} -> ${up.status}`);
  }
  ok(true, `uploaded ${at.requirements.length} required document(s)`);

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

  // ── ENV track: step 1 (DEPARTMENT_USER) → step 2 (APPROVING_AUTHORITY) ──
  const envUser = await login("demo-department_user-env@sitara.test");
  const inbox = await api("/api/v1/department/inbox", { token: envUser });
  const inInbox = (inbox.body.data.items as any[]).some((i) => i.application.id === appId);
  ok(inbox.status === 200 && inInbox, "ENV inbox shows the application");

  const view1 = await api(`/api/v1/department/applications/${appId}`, { token: envUser });
  const instances = view1.body.data.application.workflowInstances as any[];
  ok(
    instances.length === 2 && instances.map((i) => i.department.code).sort().join(",") === "ENV,INDUSTRY",
    "two parallel tracks fanned out (ENV + INDUSTRY)",
  );
  const envTrack = instances.find((i) => i.department.code === "ENV");

  const s1 = await api(`/api/v1/department/applications/${appId}/approve`, {
    token: envUser,
    body: { instanceId: envTrack.id, comment: "live step 1" },
  });
  ok(s1.status === 200 && s1.body.data.status === "STEP_ADVANCED", "ENV step 1 advanced");

  const view2 = await api(`/api/v1/department/applications/${appId}`, { token: envUser });
  const envStep2 = (view2.body.data.application.workflowInstances as any[]).find((i) => i.department.code === "ENV");
  const denied = await api(`/api/v1/department/applications/${appId}/approve`, {
    token: envUser,
    body: { instanceId: envStep2.id },
  });
  ok(denied.status === 403, "step 2 blocked for DEPARTMENT_USER (needs APPROVING_AUTHORITY)");

  const envAA = await login("demo-approving_authority-env@sitara.test");
  const s2 = await api(`/api/v1/department/applications/${appId}/approve`, {
    token: envAA,
    body: { instanceId: envStep2.id, comment: "live step 2" },
  });
  ok(s2.status === 200, "ENV track fully approved");

  // ── INDUSTRY track → final approval + Approval record ──
  const indUser = await login("demo-department_user-industry@sitara.test");
  const view3 = await api(`/api/v1/department/applications/${appId}`, { token: indUser });
  const indTrack = (view3.body.data.application.workflowInstances as any[]).find((i) => i.department.code === "INDUSTRY");
  const s3 = await api(`/api/v1/department/applications/${appId}/approve`, {
    token: indUser,
    body: { instanceId: indTrack.id, comment: "live industry clearance" },
  });
  ok(s3.status === 200, "INDUSTRY track approved");

  const finalView = await api(`/api/v1/department/applications/${appId}`, { token: envUser });
  const finalApp = finalView.body.data.application;
  ok(finalApp.status === "APPROVED", `application status = ${finalApp.status}`);
  ok((finalApp.approvals ?? []).length === 1, "Approval record issued");

  const events = (finalApp.events as any[]).map((e) => e.eventType);
  ok(events.includes("CREATED") && events.includes("APPROVED"), `events trail complete (${events.length} events)`);

  console.log(failed ? "\nLIVE E2E FAILED" : "\nLIVE E2E ALL GREEN");
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("E2E error:", err);
  process.exit(1);
});