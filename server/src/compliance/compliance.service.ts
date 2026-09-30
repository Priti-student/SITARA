// ───────────────────────────────────────────────────────────────
// Compliance service (Phase 7) — remediation cases opened from
// inspection verdicts + unit-level compliance monitoring.
// ───────────────────────────────────────────────────────────────
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { type AuthUser } from "../middleware/auth.js";
import { createNotification } from "../services/notifications.service.js";
import { recordEvent } from "../workflow/runtime.service.js";

const OFFICER_ROLES = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"];
/** Statuses that still count as "open" against an approval. */
export const OPEN_CASE_STATUSES = ["OPEN", "REMEDIATED"];
/** Remediation windows (days) by inspection verdict. */
const REMEDIATION_DAYS: Record<string, number> = { NON_COMPLIANT: 7, DEFICIENT: 15 };

function isOfficer(user: AuthUser): boolean {
  return user.roles.some((r) => OFFICER_ROLES.includes(r));
}

async function memberUnitIds(user: AuthUser): Promise<string[]> {
  const rows = await prisma.unitMember.findMany({ where: { userId: user.id }, select: { unitId: true } });
  return rows.map((r) => r.unitId);
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

/** 404 when the id is unknown or the applicant doesn't own the unit. */
function notFound(): AppError {
  return new AppError({ message: "Compliance case not found", status: 404, code: "NOT_FOUND" });
}
/**
 * Auto-opens a remediation case when an inspection completes with a
 * verdict below COMPLIANT. Called from the inspection completion flow.
 */
export async function openCaseFromInspection(inspection: {
  id: string;
  applicationId: string;
  unitId: string;
  title: string;
  findings: string | null;
  complianceStatus: string;
}) {
  const severity = inspection.complianceStatus === "DEFICIENT" ? "DEFICIENT" : "NON_COMPLIANT";
  const dueDays = REMEDIATION_DAYS[severity] ?? 15;
  const dueAt = new Date(Date.now() + dueDays * 86400000);

  const created = await prisma.complianceCase.create({
    data: {
      unitId: inspection.unitId,
      applicationId: inspection.applicationId,
      inspectionId: inspection.id,
      status: "OPEN",
      severity,
      findings: inspection.findings ?? `${inspection.title}: ${severity}`,
      remediationDueAt: dueAt,
    },
  });
  await recordEvent({
    applicationId: inspection.applicationId,
    actorRole: "SYSTEM",
    eventType: "CASE_OPENED",
    toStatus: "OPEN",
    comment: `Compliance case opened (${severity}) — remediate by ${fmtDate(dueAt)}`,
    metadata: { caseId: created.id, inspectionId: inspection.id, severity },
  });

  const app = await prisma.application.findUnique({
    where: { id: inspection.applicationId },
    select: { createdById: true, applicationNo: true },
  });
  if (app) {
    await createNotification({
      userId: app.createdById,
      type: "COMPLIANCE",
      title: "Compliance case opened",
      message: `Inspection of ${app.applicationNo} found ${severity} issues — remediate by ${fmtDate(dueAt)}.`,
      data: { caseId: created.id, applicationId: inspection.applicationId },
    });
  }
  return created;
}

/**
 * Lists compliance cases with status counts. Applicants only see
 * their units; officers see everything.
 */
export async function listComplianceCases(
  user: AuthUser,
  filters: { status?: string; unitId?: string } = {},
) {
  const scope = isOfficer(user) ? null : await memberUnitIds(user);
  const where: Record<string, unknown> = {};
  if (scope) where.unitId = { in: scope };
  if (filters.status) where.status = filters.status;
  if (filters.unitId) {
    // Applicants may only ask for their own units.
    if (scope && !scope.includes(filters.unitId)) return { items: [], counts: emptyCounts() };
    where.unitId = filters.unitId;
  }

  const items = await prisma.complianceCase.findMany({
    where,
    include: {
      unit: { select: { id: true, name: true, district: true, state: true } },
      application: { select: { id: true, applicationNo: true, status: true } },
      inspection: { select: { id: true, title: true, scheduledAt: true, completedAt: true, complianceStatus: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const grouped = await prisma.complianceCase.groupBy({
    by: ["status"],
    where: scope ? { unitId: { in: scope } } : {},
    _count: { _all: true },
  });
  return { items: items.map(shapeCase), counts: withCounts(grouped) };
}

function emptyCounts() {
  return { OPEN: 0, REMEDIATED: 0, RESOLVED: 0, total: 0 };
}

function withCounts(grouped: { status: string; _count: { _all: number } }[]) {
  const counts = emptyCounts();
  for (const g of grouped) {
    (counts as Record<string, number>)[g.status] = g._count._all;
    counts.total += g._count._all;
  }
  return counts;
}

function shapeCase(c: any) {
  const overdue =
    c.status !== "RESOLVED" && c.remediationDueAt !== null && c.remediationDueAt.getTime() < Date.now();
  return {
    id: c.id,
    status: c.status,
    severity: c.severity,
    findings: c.findings,
    remediationDueAt: c.remediationDueAt,
    overdue,
    remediationNotes: c.remediationNotes,
    remediatedAt: c.remediatedAt,
    resolutionNotes: c.resolutionNotes,
    resolvedAt: c.resolvedAt,
    createdAt: c.createdAt,
    unit: c.unit,
    application: c.application,
    inspection: c.inspection,
  };
}
/** Loads a case with relations + scoping; throws 404 for outsiders. */
async function loadCase(user: AuthUser, caseId: string) {
  const c = await prisma.complianceCase.findUnique({
    where: { id: caseId },
    include: {
      unit: { select: { id: true, name: true, district: true, state: true } },
      application: { select: { id: true, applicationNo: true, status: true } },
      inspection: {
        select: { id: true, title: true, status: true, scheduledAt: true, completedAt: true, complianceStatus: true },
      },
    },
  });
  if (!c) throw notFound();
  if (!isOfficer(user)) {
    const units = await memberUnitIds(user);
    if (!units.includes(c.unitId)) throw notFound();
  }
  return c;
}

/** Full case detail for the drawer: history + my action flags. */
export async function getComplianceCase(user: AuthUser, caseId: string) {
  const c = await loadCase(user, caseId);

  const events = c.applicationId
    ? await prisma.workflowEvent.findMany({
        where: { applicationId: c.applicationId },
        orderBy: { createdAt: "asc" },
        select: { id: true, eventType: true, actorRole: true, comment: true, createdAt: true, metadata: true },
      })
    : [];
  const caseEvents = events.filter((e: any) => !e.metadata || e.metadata.caseId === c.id);

  return {
    ...shapeCase(c),
    events: caseEvents,
    canRemediate: !isOfficer(user) && c.status === "OPEN",
    canResolve: isOfficer(user) && c.status === "REMEDIATED",
  };
}

/**
 * Rollup used by unit dashboards: derived from open cases first, then
 * the most recent completed inspection verdict, else NO_DATA.
 */
export async function getUnitComplianceStatus(user: AuthUser, unitId: string) {
  if (!isOfficer(user)) {
    const units = await memberUnitIds(user);
    if (!units.includes(unitId)) {
      throw new AppError({ message: "Unit not found", status: 404, code: "NOT_FOUND" });
    }
  }

  const cases = await prisma.complianceCase.findMany({
    where: { unitId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, status: true, severity: true, findings: true,
      remediationDueAt: true, remediatedAt: true, resolvedAt: true,
      createdAt: true, inspectionId: true,
    },
  });
  const open = cases.filter((c) => OPEN_CASE_STATUSES.includes(c.status));

  const lastInspection = await prisma.inspection.findFirst({
    where: { unitId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { id: true, title: true, complianceStatus: true, completedAt: true },
  });

  let status = "NO_DATA";
  if (open.length > 0) {
    status = open.some((c) => c.severity === "NON_COMPLIANT") ? "NON_COMPLIANT" : "DEFICIENT";
  } else if (cases.some((c) => c.status === "RESOLVED")) {
    status = "REMEDIATED";
  } else if (lastInspection?.complianceStatus) {
    status = lastInspection.complianceStatus;
  }

  return {
    unitId,
    status,
    openCases: open.length,
    totalCases: cases.length,
    cases,
    lastInspection,
  };
}
/** Applicant submits proof of remediation; case → REMEDIATED. */
export async function submitRemediation(user: AuthUser, caseId: string, notes: string) {
  const c = await loadCase(user, caseId);
  if (isOfficer(user)) {
    throw new AppError({ message: "Officers cannot file remediations", status: 403, code: "FORBIDDEN" });
  }
  if (c.status !== "OPEN") {
    throw new AppError({
      message: `Case is ${c.status} — only OPEN cases accept remediation`,
      status: 409,
      code: "BAD_STATE",
    });
  }

  const remediatedAt = new Date();
  const updated = await prisma.complianceCase.update({
    where: { id: c.id },
    data: { status: "REMEDIATED", remediationNotes: notes, remediatedAt },
  });
  if (c.applicationId) {
    await recordEvent({
      applicationId: c.applicationId,
      actorId: user.id,
      actorRole: user.roles.join(","),
      eventType: "CASE_REMEDIATED",
      fromStatus: "OPEN",
      toStatus: "REMEDIATED",
      comment: notes.slice(0, 500),
      metadata: { caseId: c.id },
    });
  }

  // Notify the inspecting department (or state admins as fallback).
  const targets = await notifyTargets(c.inspectionId);
  for (const userId of targets) {
    await createNotification({
      userId,
      type: "COMPLIANCE",
      title: "Remediation submitted",
      message: `Remediation proof filed for case on ${c.unit.name} — verify and resolve.`,
      data: { caseId: c.id },
    });
  }
  return updated;
}

async function notifyTargets(inspectionId: string | null): Promise<string[]> {
  let deptIds: string[] = [];
  if (inspectionId) {
    const parts = await prisma.inspectionParticipant.findMany({
      where: { inspectionId },
      select: { departmentId: true },
    });
    deptIds = [...new Set(parts.map((p) => p.departmentId))];
  }
  if (deptIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE", departmentId: { in: deptIds } },
      select: { id: true },
    });
    if (users.length > 0) return users.map((u) => u.id);
  }
  const admins = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["STATE_ADMIN", "SUPER_ADMIN"] } } } } },
    select: { id: true },
  });
  return admins.map((u) => u.id);
}

/**
 * Officer verifies the remediation. `accepted` closes the case
 * (RESOLVED); rejecting it reopens the case for another round.
 */
export async function resolveComplianceCase(
  user: AuthUser,
  caseId: string,
  input: { accepted: boolean; notes?: string },
) {
  if (!isOfficer(user)) {
    throw new AppError({ message: "Only officers can resolve cases", status: 403, code: "FORBIDDEN" });
  }
  const c = await prisma.complianceCase.findUnique({ where: { id: caseId } });
  if (!c) throw notFound();
  if (c.status !== "REMEDIATED") {
    throw new AppError({
      message: `Case is ${c.status} — only REMEDIATED cases can be verified`,
      status: 409,
      code: "BAD_STATE",
    });
  }

  if (input.accepted) {
    const resolvedAt = new Date();
    const updated = await prisma.complianceCase.update({
      where: { id: c.id },
      data: { status: "RESOLVED", resolutionNotes: input.notes ?? null, resolvedAt },
    });
    if (c.applicationId) {
      await recordEvent({
        applicationId: c.applicationId,
        actorId: user.id,
        actorRole: user.roles.join(","),
        eventType: "CASE_RESOLVED",
        fromStatus: "REMEDIATED",
        toStatus: "RESOLVED",
        comment: input.notes?.slice(0, 500) ?? "Remediation verified — case resolved",
        metadata: { caseId: c.id },
      });
    }
    const applicant = c.applicationId
      ? await prisma.application.findUnique({ where: { id: c.applicationId }, select: { createdById: true } })
      : null;
    if (applicant) {
      await createNotification({
        userId: applicant.createdById,
        type: "COMPLIANCE",
        title: "Compliance case resolved",
        message: `Your remediation was accepted — the case is closed.`,
        data: { caseId: c.id },
      });
    }
    return updated;
  }

  const updated = await prisma.complianceCase.update({
    where: { id: c.id },
    data: { status: "OPEN", resolutionNotes: input.notes ?? "Remediation not accepted — resubmit" },
  });
  if (c.applicationId) {
    await recordEvent({
      applicationId: c.applicationId,
      actorId: user.id,
      actorRole: user.roles.join(","),
      eventType: "CASE_REOPENED",
      fromStatus: "REMEDIATED",
      toStatus: "OPEN",
      comment: input.notes?.slice(0, 500) ?? "Remediation rejected — case reopened",
      metadata: { caseId: c.id },
    });
  }
  const applicant = c.applicationId
    ? await prisma.application.findUnique({ where: { id: c.applicationId }, select: { createdById: true } })
    : null;
  if (applicant) {
    await createNotification({
      userId: applicant.createdById,
      type: "COMPLIANCE",
      title: "Remediation rejected",
      message: `The officer rejected the remediation — please resubmit with corrections.`,
      data: { caseId: c.id },
    });
  }
  return updated;
}
