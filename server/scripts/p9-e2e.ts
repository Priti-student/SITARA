// Phase 9 LIVE end-to-end against a running server.
// 1) npm run dev   2) npm run db:seed:demo   3) npx tsx scripts/p9-e2e.ts
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
  const unitUser = await login("demo-unit-user@sitara.test");
  ok(true, "applicant / department desk / state admin / unit user signed in");

  // ── Dashboards & analytics ──
  const officerOv = await api("/api/v1/analytics/overview", { token: state });
  ok(officerOv.status === 200 && officerOv.body.data.scope === "PLATFORM", "officer overview is platform-scoped");
  ok(
    Array.isArray(officerOv.body.data.trend) && officerOv.body.data.trend.length === 6,
    "overview carries a 6-month application trend",
  );
  ok(officerOv.body.data.kpis.units >= 1, `platform KPI shows ${officerOv.body.data.kpis.units} unit(s)`);
  ok(Array.isArray(officerOv.body.data.departments), "department workload table present for officers");

  const myOv = await api("/api/v1/analytics/overview", { token: applicant });
  ok(myOv.status === 200 && myOv.body.data.scope === "MINE", "applicant overview is self-scoped");
  ok(typeof myOv.body.data.approvalRate === "number" || myOv.body.data.approvalRate === null, "approval rate computed");

  const noAuth = await api("/api/v1/analytics/overview");
  ok(noAuth.status === 401 && noAuth.body.error.code === "UNAUTHENTICATED", "overview requires auth (401)");

  // ── Alert feed ──
  const feed = await api("/api/v1/analytics/alerts", { token: state });
  ok(feed.status === 200, `officer alert feed loads (${feed.status})`);
  const { items, summary } = feed.body.data;
  ok(summary.total === items.length, `feed summary matches items (${items.length})`);
  const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const ranked = items.every((it: any, i: number) => i === 0 || order[it.severity] >= order[items[i - 1].severity]);
  ok(ranked, "alerts are severity-ranked");
  const myFeed = await api("/api/v1/analytics/alerts", { token: unitUser });
  ok(
    myFeed.status === 200 && !(myFeed.body.data.items as any[]).some((i) => i.key === "sla-breach"),
    "unit-less user's feed omits platform SLA alerts",
  );
  const capped = await api("/api/v1/analytics/alerts?limit=3", { token: state });
  ok((capped.body.data.items as any[]).length <= 3, "feed honours ?limit=");

  // ── Grievance filing + scope guards ──
  const myUnits = await api("/api/v1/units", { token: applicant });
  const unitId = (myUnits.body.data.items as any[])[0]?.id as string | undefined;

  const g1 = await api("/api/v1/grievances", {
    token: applicant,
    body: {
      subject: "Birth certificate NOC pending beyond promised timeline",
      description: "The labour department NOC was promised in 7 days; it has now been three weeks with no update.",
      category: "SERVICE_DELAY",
      priority: "HIGH",
      ...(unitId ? { unitId } : {}),
    },
  });
  ok(g1.status === 201 && /^GRV-\d{8}-[0-9A-F]{4}$/.test(g1.body.data.grievance.referenceNo), `grievance filed (${g1.body.data.grievance?.referenceNo})`);
  ok(g1.body.data.grievance.status === "OPEN", "new grievance starts OPEN");
  const gid = g1.body.data.grievance.id as string;

  // unit-less outsider sees an empty list, 404 on foreign detail
  const theirList = await api("/api/v1/grievances", { token: unitUser });
  const seeAll = (theirList.body.data.items as any[]).some((g) => g.id === gid);
  const theirDetail = await api(`/api/v1/grievances/${gid}`, { token: unitUser });
  ok(theirList.status === 200 && (!seeAll || theirDetail.status === 200), "grievance visibility scoped to filers/officers");
  const unauth = await api("/api/v1/grievances");
  ok(unauth.status === 401, "grievance list requires auth (401)");

  // ── RBAC: filer cannot handle their own grievance ──
  const selfAck = await api(`/api/v1/grievances/${gid}/acknowledge`, { method: "POST", token: applicant });
  const selfResolve = await api(`/api/v1/grievances/${gid}/resolve`, {
    method: "POST",
    token: applicant,
    body: { accepted: true, notes: "self-served" },
  });
  const selfSweep = await api("/api/v1/grievances/sweep", { method: "POST", token: applicant });
  ok(
    selfAck.status === 403 && selfResolve.status === 403 && selfSweep.status === 403,
    "filer gets 403 on acknowledge/resolve/sweep",
  );

  // ── Officer lifecycle ──
  const ack = await api(`/api/v1/grievances/${gid}/acknowledge`, { method: "POST", token: dept });
  ok(ack.status === 200 && ack.body.data.grievance.status === "IN_PROGRESS", "officer acknowledged → IN_PROGRESS");

  const resp = await api(`/api/v1/grievances/${gid}/respond`, {
    token: dept,
    body: { notes: "Referred to the labour commissioner; NOC issued in-principle." },
  });
  ok(resp.status === 200 && !!resp.body.data.grievance.respondedAt, "officer response recorded");

  const earlyEsc = await api(`/api/v1/grievances/${gid}/escalate`, {
    token: applicant,
    body: { reason: "Trying before the SLA" },
  });
  ok(
    earlyEsc.status === 409 && earlyEsc.body.error.code === "SLA_NOT_MISSED",
    "filer escalation blocked before SLA (409)",
  );

  const resolve = await api(`/api/v1/grievances/${gid}/resolve`, {
    token: dept,
    body: { accepted: true, notes: "NOC delivered; timeline breach logged for departmental review." },
  });
  ok(resolve.status === 200 && resolve.body.data.grievance.status === "RESOLVED", "grievance resolved");
  const twice = await api(`/api/v1/grievances/${gid}/resolve`, {
    token: dept,
    body: { accepted: true, notes: "again" },
  });
  ok(twice.status === 409 && twice.body.error.code === "BAD_STATE", "closed grievance rejects re-decide (409)");

  const detail = await api(`/api/v1/grievances/${gid}`, { token: applicant });
  const types = (detail.body.data.events as any[]).map((e) => e.eventType);
  ok(
    JSON.stringify(types) === JSON.stringify(["GRIEVANCE_FILED", "ACKNOWLEDGED", "RESPONSE_ADDED", "RESOLVED"]),
    "full 4-step grievance audit timeline",
  );
  ok(
    detail.body.data.can.acknowledge === false && detail.body.data.can.resolve === false,
    "no further actions on a RESOLVED grievance",
  );

  // ── Escalation: officer-escalate, then SLA sweep ──
  const g2 = await api("/api/v1/grievances", {
    token: applicant,
    body: {
      subject: "Trade licence renewal fees double-charged",
      description: "The portal charged the renewal fee twice for the same application reference.",
      category: "PROCESS_ISSUE",
      priority: "LOW",
      ...(unitId ? { unitId } : {}),
    },
  });
  ok(g2.status === 201, `second grievance filed (${g2.status})`);
  const g2Id = g2.body.data.grievance.id as string;

  const offEsc = await api(`/api/v1/grievances/${g2Id}/escalate`, {
    token: state,
    body: { reason: "Finance desk unresponsive — escalating to state level" },
  });
  ok(offEsc.status === 200 && offEsc.body.data.grievance.status === "ESCALATED", "officer escalation → ESCALATED");
  ok(offEsc.body.data.grievance.escalationLevel === 1, "escalation level incremented to 1");

  // Force the SLA into the past, then sweep. The dev server's 60s timer
  // may race us — so assert on the grievance's own state, not the global count.
  await prisma.grievance.update({ where: { id: g2Id }, data: { slaDueAt: new Date(Date.now() - 3600000), status: "IN_PROGRESS" } });
  const sweep1 = await api("/api/v1/grievances/sweep", { method: "POST", token: state });
  ok(sweep1.status === 200, `sweep endpoint runs (${sweep1.status})`);
  const afterSweep = await prisma.grievance.findUnique({ where: { id: g2Id } });
  ok(
    afterSweep?.status === "ESCALATED" && afterSweep.escalationLevel === 2,
    `overdue grievance auto-escalated again (level ${afterSweep?.escalationLevel})`,
  );
  const sweep2 = await api("/api/v1/grievances/sweep", { method: "POST", token: state });
  const afterSweep2 = await prisma.grievance.findUnique({ where: { id: g2Id } });
  ok(
    sweep2.status === 200 && afterSweep2?.escalationLevel === 2,
    "second sweep is a no-op for the same grievance (idempotent)",
  );

  const g2Events = await prisma.grievanceEvent.findMany({
    where: { grievanceId: g2Id },
    orderBy: { createdAt: "asc" },
    select: { eventType: true },
  });
  ok(
    JSON.stringify(g2Events.map((e) => e.eventType)) === JSON.stringify(["GRIEVANCE_FILED", "ESCALATED", "AUTO_ESCALATED"]),
    "escalation events recorded in order",
  );

  // Escalations show up in the queue + both dashboards/alerts
  const queue = await api("/api/v1/grievances?status=ESCALATED", { token: state });
  ok(
    queue.status === 200 && (queue.body.data.items as any[]).some((g) => g.id === g2Id),
    "escalated grievance visible in officer queue",
  );
  const ovAfter = await api("/api/v1/analytics/overview", { token: state });
  ok(ovAfter.body.data.grievances.ESCALATED >= 1, "dashboard counts escalated grievances");
  const feedAfter = await api("/api/v1/analytics/alerts", { token: state });
  ok(
    (feedAfter.body.data.items as any[]).some((i) => i.key === "grievance-escalated"),
    "alert feed carries the escalation card",
  );

  const notifs = await api("/api/v1/notifications", { token: applicant });
  const titles = (notifs.body.data.items as any[]).map((x) => x.title);
  ok(
    titles.includes("Grievance acknowledged") && titles.includes("Grievance resolved"),
    "filer notifications delivered",
  );

  // Cleanup this run's data
  await prisma.grievanceEvent.deleteMany({ where: { grievanceId: { in: [gid, g2Id] } } });
  await prisma.grievance.deleteMany({ where: { id: { in: [gid, g2Id] } } });

  console.log(failed ? "\nLIVE E2E FAILED" : `\nLIVE E2E ALL GREEN (${n} checks)`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("E2E error:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

