import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./utils/prisma.js";
import { runSlaPass } from "./workflow/sla.service.js";
import { runRenewalPass } from "./renewals/renewals.service.js";
import { runGrievancePass } from "./grievances/grievances.service.js";

async function main(): Promise<void> {
  await prisma.$connect();
  console.log("✓ Connected to PostgreSQL");

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`⚙  SITARA API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
    console.log(`   Health: GET http://localhost:${env.PORT}/api/v1/health`);
  });

  // SLA watchdog: escalate overdue workflow steps every 60 seconds
  let slaRunning = false;
  const slaTimer = setInterval(async () => {
    if (slaRunning) return;
    slaRunning = true;
    try {
      const r = await runSlaPass();
      if (r.overdue > 0) console.log(`⏰ SLA pass: ${r.overdue} overdue item(s) escalated`);
    } catch (err) {
      console.error("SLA pass failed:", err);
    } finally {
      slaRunning = false;
    }
  }, 60_000);

  // Renewal sweep (Phase 7): lapse expired approvals + pre-expiry alerts
  let renewalRunning = false;
  const renewalTimer = setInterval(async () => {
    if (renewalRunning) return;
    renewalRunning = true;
    try {
      const r = await runRenewalPass();
      if (r.expired > 0 || r.alerts > 0) {
        console.log(`🔔 Renewal pass: ${r.expired} expired, ${r.alerts} alert(s)`);
      }
    } catch (err) {
      console.error("Renewal pass failed:", err);
    } finally {
      renewalRunning = false;
    }
  }, 60_000);

  // Grievance sweep (Phase 9): auto-escalate missed response SLAs
  let grievanceRunning = false;
  const grievanceTimer = setInterval(async () => {
    if (grievanceRunning) return;
    grievanceRunning = true;
    try {
      const r = await runGrievancePass();
      if (r.escalated > 0) {
        console.log(`📣 Grievance pass: ${r.escalated} overdue grievance(s) escalated`);
      }
    } catch (err) {
      console.error("Grievance pass failed:", err);
    } finally {
      grievanceRunning = false;
    }
  }, 60_000);

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down`);
    clearInterval(slaTimer);
    clearInterval(renewalTimer);
    clearInterval(grievanceTimer);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});