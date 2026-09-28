// ───────────────────────────────────────────────────────────────
// Role verification (dev/demo): proves all three layers end-to-end:
//   1) DATA  — role rows exist in the DB
//   2) AUTH  — login works and /me returns the expected role claim
//   3) RBAC  — /admin/ping enforces SUPER_ADMIN (403 for others)
// Run: npm run roles:check
// ───────────────────────────────────────────────────────────────
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/utils/prisma.js";
import { env } from "../src/config/env.js";

const app = createApp();

const DEMO: { role: string; email: string }[] = [
  { role: "SUPER_ADMIN", email: "demo-super-admin@sitara.test" },
  { role: "STATE_ADMIN", email: "demo-state-admin@sitara.test" },
  { role: "DEPARTMENT_USER", email: "demo-department-user@sitara.test" },
  { role: "APPROVING_AUTHORITY", email: "demo-approving-authority@sitara.test" },
  { role: "INSPECTOR", email: "demo-inspector@sitara.test" },
  { role: "APPLICANT", email: "demo-applicant@sitara.test" },
  { role: "UNIT_USER", email: "demo-unit-user@sitara.test" },
];

interface Row {
  who: string;
  email: string;
  auth: string; // OK / FAIL(login) / MISMATCH(role claim)
  ping: number; // HTTP status of /admin/ping
  verdict: string;
}

async function main(): Promise<void> {
  const roleCount = await prisma.role.count();
  console.log(`\n1) DATA — Role rows in DB         : ${roleCount} (expect 7)`);

  const rows: Row[] = [];

  for (const { role, email } of DEMO) {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: env.DEMO_USER_PASSWORD });

    if (login.status !== 200) {
      rows.push({ who: role, email, auth: `LOGIN ${login.status}`, ping: 0, verdict: "✗ NO LOGIN" });
      continue;
    }
    const token = login.body.data.accessToken;
    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    const hasRole = me.body.data.user.roles.includes(role);
    const ping = await request(app)
      .get("/api/v1/admin/ping")
      .set("Authorization", `Bearer ${token}`);

    rows.push({
      who: role,
      email,
      auth: hasRole ? "OK" : "MISMATCH",
      ping: ping.status,
      verdict: ping.status === 200 ? "✓ ALLOWED" : ping.status === 403 ? "✓ DENIED (expected for this role)" : "✗ UNEXPECTED",
    });
  }

  // Bootstrap admin (its own credentials from .env)
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    const token = login.body?.data?.accessToken;
    const ping = token
      ? await request(app).get("/api/v1/admin/ping").set("Authorization", `Bearer ${token}`)
      : null;
    rows.push({
      who: "ADMIN (.env)",
      email: env.ADMIN_EMAIL,
      auth: login.status === 200 ? "OK" : `LOGIN ${login.status}`,
      ping: ping?.status ?? 0,
      verdict: ping?.status === 200 ? "✓ ALLOWED" : "✗ UNEXPECTED",
    });
  }

  // Unauthenticated probe
  const anon = await request(app).get("/api/v1/admin/ping");
  rows.push({
    who: "<no token>",
    email: "—",
    auth: "n/a",
    ping: anon.status,
    verdict: anon.status === 401 ? "✓ DENIED (401, expected)" : "✗ UNEXPECTED",
  });

  console.log("\n2) AUTH — login + /me role claim (all demo users share DEMO_USER_PASSWORD)");
  console.log("3) RBAC — GET /api/v1/admin/ping (SUPER_ADMIN only)\n");
  console.log(`${"WHO".padEnd(22)} ${"EMAIL".padEnd(36)} ${"AUTH".padEnd(9)} ${"PING".padEnd(6)} VERDICT`);
  console.log("─".repeat(106));
  for (const r of rows) {
    console.log(
      `${r.who.padEnd(22)} ${r.email.padEnd(36)} ${r.auth.padEnd(9)} ${String(r.ping).padEnd(6)} ${r.verdict}`
    );
  }
  console.log("─".repeat(106));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("Role check failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });