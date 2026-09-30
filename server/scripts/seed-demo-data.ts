// ───────────────────────────────────────────────────────────────────────────
// Phase 10 — demo seed data (dev only).
//
// Builds a walkthrough-ready dataset through the REAL service layer
// (checklist → applications → workflows → approvals → renewal → inspection →
// incentives → grievances → notifications), so seeded records are exactly
// what the product produces at runtime — audit events and notifications
// included.
//
// Prerequisites:  npm run db:seed        (roles, master data, rules, schemes)
//                 npm run db:seed:demo   (the demo-*@sitara.test users)
// Run:            npm run db:seed:data   (safe to re-run — wipe & rebuild)
//
// Idempotency: the seed owns one unit keyed by a unique registrationNo.
// A re-run first wipes that unit's applications/claims/grievances/checklists
// and any notifications referencing them (Prisma cascades handle workflow
// instances, events, approvals, inspections and claim/grievance events),
// then rebuilds the dataset from scratch — so counts never drift.
// ───────────────────────────────────────────────────────────────────────────
import { prisma } from "../src/utils/prisma.js";
import type { AuthUser } from "../src/middleware/auth.js";
import * as applications from "../src/services/applications.service.js";
import * as checklists from "../src/services/checklists.service.js";
import * as units from "../src/services/units.service.js";
import * as department from "../src/workflow/department.service.js";
import * as runtime from "../src/workflow/runtime.service.js";
import { trackForDept } from "../src/workflow/types.js";
import * as inspections from "../src/inspections/inspections.service.js";
import * as renewals from "../src/renewals/renewals.service.js";
import * as incentives from "../src/incentives/incentives.service.js";
import * as grievances from "../src/grievances/grievances.service.js";

/** Everyone the seed acts as — resolved from the demo users in the DB. */
export interface SeedContext {
  applicant: AuthUser;
  unitUser: AuthUser;
  envDept: AuthUser;
  envApprover: AuthUser;
  industryDept: AuthUser;
  labourDept: AuthUser;
  fireDept: AuthUser;
  inspectorFire: AuthUser;
  stateAdmin: AuthUser;
}

export interface SeedOptions {
  /** Unique registrationNo marker for the owned unit (re-runs wipe it first). */
  registrationNo?: string;
  unitName?: string;
}

export interface SeedResult {
  unitId: string;
  checklistId: string;
  applications: {
    draft: string;
    inApproval: string;
    query: string;
    approved: string; // MPCB_CTO — valid for 365d, renewed once below
    approvedNoExpiry: string; // ESI_REG — perpetual approval
    rejected: string;
  };
  approvalId: string; // the renewed CTO approval
  inspectionId: string;
  claimIds: { utilised: string | null; submitted: string | null };
  grievanceIds: { open: string; resolved: string };
}

const DEMO_EMAILS = {
  applicant: "demo-applicant@sitara.test",
  unitUser: "demo-unit-user@sitara.test",
  envDept: "demo-department_user-env@sitara.test",
  envApprover: "demo-approving_authority-env@sitara.test",
  industryDept: "demo-department_user-industry@sitara.test",
  labourDept: "demo-department_user-labour@sitara.test",
  fireDept: "demo-department_user-fire@sitara.test",
  inspectorFire: "demo-inspector-fire@sitara.test",
  stateAdmin: "demo-state_admin-industry@sitara.test",
} as const;

/** Notification `data` keys we may have written — used to prune on re-run. */
const NOTIFICATION_KEYS = [
  "applicationId",
  "approvalId",
  "claimId",
  "grievanceId",
  "inspectionId",
  "checklistId",
  "unitId",
] as const;

/** Discovery-wizard answers for the demo unit (mirrors the proven Phase-6 fixture). */
const CHECKLIST_CONTEXT = {
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

/**
 * Removes everything the seed owns for a unit: notifications that reference
 * its records first (JSON path match), then the records themselves. Cascades
 * take care of documents, workflow instances, events, approvals, inspections,
 * checklist items, claim events and grievance events.
 */
export async function wipeSeedData(unitId: string): Promise<void> {
  const [apps, claims, gs, cls, approvals, insp] = await Promise.all([
    prisma.application.findMany({ where: { unitId }, select: { id: true } }),
    prisma.incentiveClaim.findMany({ where: { unitId }, select: { id: true } }),
    prisma.grievance.findMany({ where: { unitId }, select: { id: true } }),
    prisma.checklist.findMany({ where: { unitId }, select: { id: true } }),
    prisma.approval.findMany({ where: { unitId }, select: { id: true } }),
    prisma.inspection.findMany({ where: { unitId }, select: { id: true } }),
  ]);
  const ids = [
    ...apps.map((r) => r.id),
    ...claims.map((r) => r.id),
    ...gs.map((r) => r.id),
    ...cls.map((r) => r.id),
    ...approvals.map((r) => r.id),
    ...insp.map((r) => r.id),
    unitId,
  ];
  for (const id of ids) {
    const or = NOTIFICATION_KEYS.map((k) => ({ data: { path: [k], equals: id } }));
    await prisma.notification.deleteMany({ where: { OR: or as never } });
  }

  await prisma.grievance.deleteMany({ where: { unitId } });
  await prisma.incentiveClaim.deleteMany({ where: { unitId } });
  await prisma.complianceCase.deleteMany({ where: { unitId } });
  await prisma.checklist.deleteMany({ where: { unitId } });
  await prisma.application.deleteMany({ where: { unitId } });
}

/** Picks the demo officer entitled to act on a department's workflow step. */
function pickOfficer(ctx: SeedContext, dept: string, role?: string): AuthUser {
  if (role === "APPROVING_AUTHORITY" && dept === "ENV") return ctx.envApprover;
  if (role === "DEPARTMENT_USER") {
    if (dept === "ENV") return ctx.envDept;
    if (dept === "INDUSTRY") return ctx.industryDept;
    if (dept === "LABOUR") return ctx.labourDept;
    if (dept === "FIRE") return ctx.fireDept;
  }
  // No dedicated demo desk for this step — state admins act across departments.
  return ctx.stateAdmin;
}

/** Attaches every required document, fills the required form fields and submits. */
async function completeDraft(ownerId: string, applicationId: string): Promise<void> {
  const full = await applications.getById(ownerId, applicationId);
  for (const r of full.approvalType.requirements) {
    const buf = Buffer.from(`%PDF-1.4\n% SITARA phase-10 seed — ${applicationId} ${r.documentType.code}\n%%EOF\n`);
    await applications.uploadDocument(
      ownerId,
      applicationId,
      r.documentType.code,
      {
        originalName: `${r.documentType.code}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: buf.length,
        buffer: buf,
      },
      false,
    );
  }
  const fields = (full.approvalType.formSchema ?? []) as unknown as FormField[];
  const formData: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.required) continue;
    formData[f.key] = f.type === "number" ? 5000 : f.options?.length ? f.options[0] : "DEMO";
  }
  await applications.updateForm(ownerId, applicationId, formData);
  await applications.submitApplication(ownerId, applicationId);
}

/** Drives every active workflow instance to completion → APPROVED + Approval issued. */
async function approveAll(ctx: SeedContext, applicationId: string): Promise<void> {
  for (let guard = 0; guard < 12; guard += 1) {
    const status = (
      await prisma.application.findUnique({ where: { id: applicationId }, select: { status: true } })
    )?.status;
    if (status !== "UNDER_SCRUTINY") return;
    const view = await department.viewApplication(ctx.envDept, applicationId);
    const active = view.workflowInstances.find((i) => i.status === "ACTIVE");
    if (!active) return;
    const route = await runtime.getRouteForApplication(applicationId);
    const track = trackForDept(route, active.department.code);
    const step = track?.steps.find((s) => s.order === active.currentStepOrder);
    const officer = pickOfficer(ctx, active.department.code, step?.role);
    await department.approveStep(officer, active.id, `Seeded approval — ${step?.label ?? "step"}`);
  }
  throw new Error(`Approval drive did not settle for application ${applicationId}`);
}


interface FormField {
  key: string;
  type?: string;
  required?: boolean;
  options?: string[];
}

/** Loads one demo user as an AuthUser (roles fresh from the DB). */
async function loadDemoUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.status !== "ACTIVE") {
    throw new Error(`Demo user ${email} not found (or inactive) — run \`npm run db:seed:demo\` first.`);
  }
  return { id: user.id, email: user.email, roles: user.roles.map((r) => r.role.name) };
}

/** Resolves the standard demo cast from the seeded @sitara.test users. */
export async function resolveDemoContext(): Promise<SeedContext> {
  const entries = await Promise.all(
    Object.entries(DEMO_EMAILS).map(async ([key, email]) => [key, await loadDemoUser(email)] as const),
  );
  return Object.fromEntries(entries) as unknown as SeedContext;
}


/** The full demo dataset. Pass a unique registrationNo for test isolation. */
export async function seedDemoData(ctx: SeedContext, options: SeedOptions = {}): Promise<SeedResult> {
  const registrationNo = options.registrationNo ?? "SITARA-P10-DEMO";
  const unitName = options.unitName ?? "SITARA Demo Pharma Works";

  // ── Unit (owned by the demo applicant; wipe-and-reseed on re-runs) ──
  let unit = await prisma.unit.findUnique({ where: { registrationNo } });
  if (unit) {
    await wipeSeedData(unit.id);
  } else {
    unit = await units.createUnit(ctx.applicant.id, {
      name: unitName,
      registrationNo,
      industryType: "pharmaceuticals",
      sector: "Pharmaceuticals",
      establishmentType: "factory",
      state: "Maharashtra",
      district: "Pune",
      address: "Plot 42, Chakan MIDC, Pune",
      pincode: "411019",
      employeeCount: 120,
      capitalInvestment: 25_000_000,
    });
  }
  const unitId = unit.id;
  // The unit user gets view/act rights on the unit without ownership.
  await prisma.unitMember.upsert({
    where: { unitId_userId: { unitId, userId: ctx.unitUser.id } },
    create: { unitId, userId: ctx.unitUser.id, role: "CONTACT" },
    update: { role: "CONTACT" },
  });

  // ── Personalised checklist (knowledge engine run) ──
  const checklist = await checklists.createChecklist(ctx.applicant.id, {
    unitId,
    name: "SITARA demo — approvals checklist",
    context: CHECKLIST_CONTEXT,
  });

  // ── 1. DRAFT — partially completed employer registration ──
  const draft = await applications.createApplication(ctx.applicant.id, {
    unitId,
    approvalTypeCode: "ESI_REG",
  });
  const draftFull = await applications.getById(ctx.applicant.id, draft.id);
  const draftFields = (draftFull.approvalType.formSchema ?? []) as unknown as FormField[];
  const partial: Record<string, unknown> = {};
  for (const f of draftFields.slice(0, 2)) partial[f.key] = f.type === "number" ? 120 : "DEMO";
  await applications.updateForm(ctx.applicant.id, draft.id, partial);

  // ── 2. IN APPROVAL — submitted fire NOC, awaiting the FIRE desk ──
  const fireApp = await applications.createApplication(ctx.applicant.id, {
    unitId,
    approvalTypeCode: "FIRE_NOC_PROV",
  });
  await completeDraft(ctx.applicant.id, fireApp.id);

  // ── 3. QUERY — CTE submitted, ENV raised a query on the first step ──
  const cte = await applications.createApplication(ctx.applicant.id, {
    unitId,
    approvalTypeCode: "MPCB_CTE",
    ...(checklist.items.length > 0 ? { checklistItemId: checklist.items[0].id } : {}),
  });
  await completeDraft(ctx.applicant.id, cte.id);
  const cteView = await department.viewApplication(ctx.envDept, cte.id);
  const envInstance = cteView.workflowInstances.find((i) => i.department.code === "ENV");
  if (!envInstance) throw new Error("Expected an ENV workflow instance on the CTE application");
  await department.raiseQuery(
    ctx.envDept,
    envInstance.id,
    "Please upload the latest consent fee receipt along with the CTE application.",
  );

  // ── 4. APPROVED + RENEWED — CTO driven through both ENV steps ──
  const cto = await applications.createApplication(ctx.applicant.id, {
    unitId,
    approvalTypeCode: "MPCB_CTO",
  });
  await completeDraft(ctx.applicant.id, cto.id);
  await approveAll(ctx, cto.id);
  const approval = await prisma.approval.findFirst({ where: { applicationId: cto.id } });
  if (!approval) throw new Error("CTO approval was not issued");

  const renewalDraft = await renewals.createRenewalApplication(ctx.applicant, approval.id);
  await completeDraft(ctx.applicant.id, renewalDraft.id);
  await approveAll(ctx, renewalDraft.id);
  const renewed = await prisma.approval.findUnique({ where: { id: approval.id } });
  if (!renewed || renewed.renewalCount !== 1) throw new Error("CTO renewal did not complete");

  // ── 5. APPROVED (no expiry) — single-step labour registration ──
  const esi = await applications.createApplication(ctx.applicant.id, {
    unitId,
    approvalTypeCode: "ESI_REG",
  });
  await completeDraft(ctx.applicant.id, esi.id);
  await approveAll(ctx, esi.id);

  // ── 6. REJECTED — ENV closes a second CTE with a reason ──
  const rejected = await applications.createApplication(ctx.applicant.id, {
    unitId,
    approvalTypeCode: "MPCB_CTE",
  });
  await completeDraft(ctx.applicant.id, rejected.id);
  const rejView = await department.viewApplication(ctx.envDept, rejected.id);
  const rejInstance = rejView.workflowInstances.find((i) => i.status === "ACTIVE");
  if (!rejInstance) throw new Error("Expected an active instance on the to-be-rejected application");
  await department.rejectApplication(
    pickOfficer(ctx, rejInstance.department.code),
    rejInstance.id,
    "Land-use conversion certificate not attached.",
  );

  // ── Inspection on the submitted fire NOC: plan → assign → visit → verdict ──
  const plan = await inspections.createInspection(ctx.stateAdmin, {
    applicationId: fireApp.id,
    scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    venue: "SITARA Demo Plant, Chakan MIDC, Pune",
  });
  const participant =
    plan.participants.find((p) => p.department.code === "FIRE") ?? plan.participants[0];
  if (!participant) throw new Error("Inspection has no participants");
  await inspections.assignInspector(ctx.stateAdmin, plan.id, participant.id, ctx.inspectorFire.id);
  await inspections.startInspection(ctx.inspectorFire, plan.id);
  await inspections.fileObservation(ctx.inspectorFire, plan.id, {
    participantId: participant.id,
    compliant: true,
    notes: "Exits, hydrants and control room verified on site.",
  });
  await inspections.completeInspection(ctx.stateAdmin, plan.id, {
    findings: "Fire safety provisions in order; no objections for the provisional NOC.",
    complianceStatus: "COMPLIANT",
  });

  // ── Incentives: MSME claim through the full lifecycle + a fresh one ──
  const claimIds: SeedResult["claimIds"] = { utilised: null, submitted: null };
  const msme = await prisma.incentiveScheme.findUnique({ where: { code: "MSME_CAPITAL_SUBSIDY_001" } });
  const skill = await prisma.incentiveScheme.findUnique({ where: { code: "SKILL_DEVELOPMENT_GRANT_001" } });
  if (!msme || !skill) {
    console.warn("! Incentive schemes missing — run `npm run db:seed` for the full dataset.");
  }
  if (msme) {
    const claim = await incentives.createClaim(ctx.applicant, {
      schemeId: msme.id,
      unitId,
      requestedAmountInr: 400_000,
      notes: "Machinery upgrade — demo claim",
    });
    await incentives.startReview(ctx.stateAdmin, claim.id);
    await incentives.decideClaim(ctx.stateAdmin, claim.id, {
      approved: true,
      amountInr: 400_000,
      notes: "Eligibility verified against MSME criteria.",
    });
    await incentives.disburseClaim(ctx.stateAdmin, claim.id, { reference: "P10-SEED-DISB-001" });
    await incentives.recordUtilisation(ctx.applicant, claim.id, {
      notes: "Utilised towards plant machinery (seeded demo).",
    });
    claimIds.utilised = claim.id;
  }
  if (skill) {
    const claim = await incentives.createClaim(ctx.applicant, {
      schemeId: skill.id,
      unitId,
      requestedAmountInr: 150_000,
      notes: "Operator skilling programme — awaiting officer review",
    });
    claimIds.submitted = claim.id;
  }

  // ── Grievances: one open, one acknowledged→responded→resolved ──
  const gOpen = await grievances.createGrievance(ctx.applicant, {
    subject: "CTO renewal pending beyond SLA",
    description: "The consent to operate renewal has been under scrutiny for over a week without an update.",
    category: "SERVICE_DELAY",
    priority: "HIGH",
    unitId,
  });
  const gDone = await grievances.createGrievance(ctx.unitUser, {
    subject: "Portal charged the inspection fee twice",
    description: "Two identical debits were made for the joint inspection fee against the same application reference.",
    category: "PROCESS_ISSUE",
    priority: "MEDIUM",
    unitId,
    applicationId: fireApp.id,
  });
  await grievances.acknowledgeGrievance(ctx.stateAdmin, gDone.id);
  await grievances.respondToGrievance(
    ctx.stateAdmin,
    gDone.id,
    "The duplicate debit is identified — refund initiated against the second transaction.",
  );
  await grievances.decideGrievance(ctx.stateAdmin, gDone.id, {
    accepted: true,
    notes: "Refund processed; receipt re-issued to the unit.",
  });

  return {
    unitId,
    checklistId: checklist.id,
    applications: {
      draft: draft.id,
      inApproval: fireApp.id,
      query: cte.id,
      approved: cto.id,
      approvedNoExpiry: esi.id,
      rejected: rejected.id,
    },
    approvalId: renewed.id,
    inspectionId: plan.id,
    claimIds,
    grievanceIds: { open: gOpen.id, resolved: gDone.id },
  };
}

async function main(): Promise<void> {
  const ctx = await resolveDemoContext();
  const result = await seedDemoData(ctx);

  const statuses = await prisma.application.groupBy({
    by: ["status"],
    where: { unitId: result.unitId },
    _count: { _all: true },
  });
  const approval = await prisma.approval.findUnique({ where: { id: result.approvalId } });
  const inspection = await prisma.inspection.findUnique({ where: { id: result.inspectionId } });

  console.log("──────────────────────── Phase 10 demo data ────────────────────────");
  console.log(`  unit            ${result.unitId}`);
  console.log(`  checklist       ${result.checklistId}`);
  console.log(`  applications    ${statuses.map((s) => `${s.status}=${s._count._all}`).join(" · ")}`);
  console.log(
    `  approval        ${approval?.approvalNo} (renewed ×${approval?.renewalCount}, valid till ${
      approval?.validTill?.toISOString().slice(0, 10) ?? "—"
    })`,
  );
  console.log(`  inspection      ${inspection?.status} / ${inspection?.complianceStatus}`);
  console.log(
    `  claims          utilised=${result.claimIds.utilised ? "yes" : "no"} · submitted=${
      result.claimIds.submitted ? "yes" : "no"
    }`,
  );
  console.log("  grievances      one OPEN + one RESOLVED (see /grievances)");
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log("Re-run safely with `npm run db:seed:data` — the dataset is rebuilt, not duplicated.");
}

// Only run when executed directly (`tsx scripts/seed-demo-data.ts`), not on import.
if (process.argv[1]?.endsWith("seed-demo-data.ts")) {
  main()
    .catch((err) => {
      console.error("Demo data seed failed:", err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
