// ───────────────────────────────────────────────────────────────
// Inspections service (Phase 6) — risk-based scrutiny + joint
// inspection planning, assignment, field reports & completion.
// ───────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { type AuthUser } from "../middleware/auth.js";
import { createNotification } from "../services/notifications.service.js";
import { recordEvent } from "../workflow/runtime.service.js";
import { openCaseFromInspection } from "../compliance/compliance.service.js";
import { scoreRisk, type RiskResult, type RiskSignals } from "./risk.js";

const OFFICER_ROLES = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"];
const READ_ROLES = [...OFFICER_ROLES, "INSPECTOR"];

export function isOfficer(user: AuthUser): boolean {
  return user.roles.some((r) => OFFICER_ROLES.includes(r));
}

function canReadAll(user: AuthUser): boolean {
  return user.roles.some((r) => READ_ROLES.includes(r));
}

function assertOfficer(user: AuthUser): void {
  if (!isOfficer(user)) {
    throw new AppError({ message: "Officer access required", status: 403, code: "FORBIDDEN" });
  }
}

async function getApplicationOr404(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { unit: true },
  });
  if (!app) {
    throw new AppError({ message: "Application not found", status: 404, code: "NOT_FOUND" });
  }
  return app;
}

/** Read access to an application's inspections: the owner or any officer/inspector. */
async function assertCanReadApplication(user: AuthUser, applicationId: string) {
  if (canReadAll(user)) return;
  const owned = await prisma.application.findFirst({
    where: { id: applicationId, createdById: user.id },
    select: { id: true },
  });
  if (!owned) {
    throw new AppError({ message: "Application not found", status: 404, code: "NOT_FOUND" });
  }
}

/** Gathers every risk signal for an application from the database. */
async function gatherSignals(app: Awaited<ReturnType<typeof getApplicationOr404>>): Promise<RiskSignals> {
  const [rejectedDocuments, priorRejections, priorNonCompliances] = await Promise.all([
    prisma.applicationDocument.count({ where: { applicationId: app.id, status: "REJECTED" } }),
    prisma.application.count({ where: { unitId: app.unitId, status: "REJECTED", id: { not: app.id } } }),
    prisma.inspection.count({
      where: { unitId: app.unitId, status: "COMPLETED", complianceStatus: { not: "COMPLIANT" } },
    }),
  ]);
  return {
    riskCategory: app.riskCategory,
    capitalInvestment: app.unit.capitalInvestment,
    employeeCount: app.unit.employeeCount,
    rejectedDocuments,
    priorRejections,
    priorNonCompliances,
  };
}

/**
 * Computes (or recomputes) the risk assessment and persists it.
 * Returns the stored assessment with factor breakdown.
 */
export async function assessRisk(user: AuthUser, applicationId: string) {
  await assertCanReadApplication(user, applicationId);
  const app = await getApplicationOr404(applicationId);
  const result = scoreRisk(await gatherSignals(app));
  const factors = result.factors as unknown as Prisma.InputJsonValue;
  return prisma.riskAssessment.upsert({
    where: { applicationId },
    create: {
      applicationId,
      score: result.score,
      category: result.category,
      scrutinyLevel: result.scrutinyLevel,
      requiresInspection: result.requiresInspection,
      factors,
      assessedAt: new Date(),
    },
    update: {
      score: result.score,
      category: result.category,
      scrutinyLevel: result.scrutinyLevel,
      requiresInspection: result.requiresInspection,
      factors,
      assessedAt: new Date(),
    },
  });
}

/** Non-persisting assessment used when planning an inspection (risk snapshot). */
async function currentRisk(applicationId: string): Promise<RiskResult> {
  const app = await getApplicationOr404(applicationId);
  return scoreRisk(await gatherSignals(app));
}

const PARTICIPANT_SELECT = {
  id: true,
  observedAt: true,
  department: { select: { id: true, code: true, name: true } },
  inspector: { select: { id: true, fullName: true, email: true } },
} as const;

/** Lists inspections visible to the caller (officers/inspectors: all, applicants: own). */
export async function listInspections(
  user: AuthUser,
  filters: { status?: string; applicationId?: string; mine?: boolean } = {},
) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.applicationId) where.applicationId = filters.applicationId;
  if (filters.mine) where.participants = { some: { inspectorId: user.id } };
  if (!canReadAll(user)) where.application = { createdById: user.id };

  const inspections = await prisma.inspection.findMany({
    where,
    include: {
      application: {
        select: {
          id: true,
          applicationNo: true,
          status: true,
          riskCategory: true,
          approvalType: { select: { code: true, name: true } },
          unit: { select: { id: true, name: true, district: true, state: true } },
        },
      },
      participants: { select: PARTICIPANT_SELECT, orderBy: { createdAt: "asc" } },
      _count: { select: { observations: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 200,
  });

  return {
    items: inspections,
    counts: {
      scheduled: inspections.filter((i) => i.status === "SCHEDULED").length,
      active: inspections.filter((i) => i.status === "IN_PROGRESS").length,
      completed: inspections.filter((i) => i.status === "COMPLETED").length,
      cancelled: inspections.filter((i) => i.status === "CANCELLED").length,
    },
  };
}

/** Full inspection detail: participants, observations, risk snapshot, audit events. */
export async function getInspection(user: AuthUser, inspectionId: string) {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      application: {
        select: {
          id: true,
          applicationNo: true,
          status: true,
          riskCategory: true,
          createdById: true,
          approvalType: { select: { code: true, name: true } },
          unit: { select: { id: true, name: true, district: true, state: true, address: true } },
        },
      },
      participants: { include: { department: true, inspector: true }, orderBy: { createdAt: "asc" } },
      observations: {
        include: { participant: { include: { department: true, inspector: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!inspection) {
    throw new AppError({ message: "Inspection not found", status: 404, code: "NOT_FOUND" });
  }
  if (!canReadAll(user) && inspection.application.createdById !== user.id) {
    throw new AppError({ message: "Inspection not found", status: 404, code: "NOT_FOUND" });
  }

  const risk = await prisma.riskAssessment.findUnique({ where: { applicationId: inspection.applicationId } });
  const events = await prisma.workflowEvent.findMany({
    where: { applicationId: inspection.applicationId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const { application, ...rest } = inspection;
  const { createdById: _owner, ...appView } = application;
  return {
    ...rest,
    application: appView,
    risk,
    events: events.filter((e) => {
      const meta = e.metadata as { inspectionId?: string } | null;
      return meta?.inspectionId === inspectionId;
    }),
    myParticipantIds: inspection.participants.filter((p) => p.inspectorId === user.id).map((p) => p.id),
    canManage: isOfficer(user),
  };
}

export interface CreateInspectionInput {
  applicationId: string;
  title?: string;
  scheduledAt: string;
  venue?: string;
  departmentCodes?: string[];
}

/**
 * Plans a joint inspection. Departments default to the application's
 * active workflow tracks so one visit covers every desk involved.
 */
export async function createInspection(user: AuthUser, input: CreateInspectionInput) {
  assertOfficer(user);
  const app = await getApplicationOr404(input.applicationId);
  if (app.status === "DRAFT" || app.status === "WITHDRAWN") {
    throw new AppError({
      message: "Inspections can only be planned for submitted applications",
      status: 409,
      code: "NOT_SUBMITTED",
    });
  }

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new AppError({ message: "Invalid scheduled date", status: 400, code: "VALIDATION_ERROR" });
  }

  // Departments: explicit codes, else the application's workflow tracks.
  let codes = (input.departmentCodes ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (codes.length === 0) {
    const tracks = await prisma.workflowInstance.findMany({
      where: { applicationId: app.id },
      include: { department: { select: { code: true } } },
      distinct: ["departmentId"],
    });
    codes = tracks.map((t) => t.department.code);
  }
  if (codes.length === 0) {
    throw new AppError({
      message: "No departments to inspect — select at least one department",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }
  const departments = await prisma.department.findMany({ where: { code: { in: codes } } });
  if (departments.length !== codes.length) {
    throw new AppError({ message: "Unknown department code", status: 400, code: "VALIDATION_ERROR" });
  }

  const duplicate = await prisma.inspection.findFirst({
    where: { applicationId: app.id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
    select: { id: true },
  });
  if (duplicate) {
    throw new AppError({
      message: "An inspection is already scheduled for this application",
      status: 409,
      code: "INSPECTION_EXISTS",
    });
  }

  const risk = await currentRisk(app.id);
  const venue =
    input.venue?.trim() ||
    app.unit.address ||
    `${app.unit.name}, ${app.unit.district ?? ""} ${app.unit.state ?? ""}`;
  const title = input.title?.trim() || `Joint site inspection — ${app.applicationNo}`;

  const inspection = await prisma.inspection.create({
    data: {
      applicationId: app.id,
      unitId: app.unitId,
      title,
      scheduledAt,
      venue,
      riskScoreAtScheduling: risk.score,
      participants: { create: departments.map((d) => ({ departmentId: d.id })) },
    },
    include: { participants: { include: { department: true } } },
  });

  await recordEvent({
    applicationId: app.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "INSPECTION_SCHEDULED",
    fromStatus: app.status,
    toStatus: "SCHEDULED",
    comment: `${title} on ${scheduledAt.toISOString().slice(0, 10)} — ${departments.map((d) => d.code).join(", ")}`,
    metadata: { inspectionId: inspection.id, departments: departments.map((d) => d.code), riskScore: risk.score },
  });

  await createNotification({
    userId: app.createdById,
    type: "INSPECTION",
    title: "Site inspection scheduled",
    message: `${title} — ${scheduledAt.toLocaleString()} at ${venue}.`,
    data: { inspectionId: inspection.id, applicationId: app.id },
  });

  // Let inspectors in the invited departments know a visit awaits assignment.
  const inspectors = await prisma.user.findMany({
    where: {
      roles: { some: { role: { name: "INSPECTOR" } } },
      departmentId: { in: departments.map((d) => d.id) },
      status: "ACTIVE",
      id: { not: user.id },
    },
    select: { id: true },
  });
  for (const inspector of inspectors) {
    await createNotification({
      userId: inspector.id,
      type: "INSPECTION",
      title: "Joint inspection planned",
      message: `${title} on ${scheduledAt.toLocaleString()} — awaiting inspector assignment.`,
      data: { inspectionId: inspection.id, applicationId: app.id },
    });
  }

  return inspection;
}

/** Assigns (or reassigns) an inspector to one participating department. */
export async function assignInspector(
  user: AuthUser,
  inspectionId: string,
  participantId: string,
  inspectorId: string,
) {
  assertOfficer(user);
  const participant = await prisma.inspectionParticipant.findFirst({
    where: { id: participantId, inspectionId },
    include: { department: true, inspection: { include: { application: true } } },
  });
  if (!participant) {
    throw new AppError({ message: "Participant not found", status: 404, code: "NOT_FOUND" });
  }

  const inspector = await prisma.user.findFirst({
    where: { id: inspectorId, status: "ACTIVE", roles: { some: { role: { name: "INSPECTOR" } } } },
    select: { id: true, fullName: true },
  });
  if (!inspector) {
    throw new AppError({ message: "Target user is not an active inspector", status: 400, code: "INVALID_INSPECTOR" });
  }

  await prisma.inspectionParticipant.update({
    where: { id: participant.id },
    data: { inspectorId: inspector.id },
  });

  await recordEvent({
    applicationId: participant.inspection.applicationId,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "INSPECTION_ASSIGNED",
    toStatus: "ASSIGNED",
    comment: `${inspector.fullName} assigned to ${participant.department.code}`,
    metadata: { inspectionId, participantId: participant.id, inspectorId: inspector.id },
  });

  await createNotification({
    userId: inspector.id,
    type: "INSPECTION",
    title: "You are assigned to an inspection",
    message: `${participant.inspection.title} — ${new Date(participant.inspection.scheduledAt).toLocaleString()}`,
    data: { inspectionId, applicationId: participant.inspection.applicationId },
  });

  return { success: true };
}

async function loadInspection(inspectionId: string) {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: { participants: true },
  });
  if (!inspection) {
    throw new AppError({ message: "Inspection not found", status: 404, code: "NOT_FOUND" });
  }
  return inspection;
}

async function assertInvolved(user: AuthUser, inspection: Awaited<ReturnType<typeof loadInspection>>): Promise<void> {
  if (isOfficer(user)) return;
  const assigned = inspection.participants.some((p) => p.inspectorId === user.id);
  if (!assigned) {
    throw new AppError({ message: "You are not assigned to this inspection", status: 403, code: "FORBIDDEN" });
  }
}

/** Marks the visit as started (assigned inspector or officer). */
export async function startInspection(user: AuthUser, inspectionId: string) {
  const inspection = await loadInspection(inspectionId);
  await assertInvolved(user, inspection);
  if (inspection.status !== "SCHEDULED") {
    throw new AppError({ message: `Cannot start — inspection is ${inspection.status}`, status: 409, code: "BAD_STATE" });
  }

  await prisma.inspection.update({ where: { id: inspectionId }, data: { status: "IN_PROGRESS" } });
  await recordEvent({
    applicationId: inspection.applicationId,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "INSPECTION_STARTED",
    fromStatus: "SCHEDULED",
    toStatus: "IN_PROGRESS",
    comment: "Site visit commenced",
    metadata: { inspectionId },
  });
  return { success: true, status: "IN_PROGRESS" };
}

/** Files this inspector department's field observations for the visit. */
export async function fileObservation(
  user: AuthUser,
  inspectionId: string,
  input: { participantId?: string; compliant: boolean; notes: string },
) {
  const inspection = await loadInspection(inspectionId);
  if (inspection.status !== "IN_PROGRESS") {
    throw new AppError({
      message: "Observations can only be filed while the inspection is in progress",
      status: 409,
      code: "BAD_STATE",
    });
  }

  let mine = inspection.participants.filter((p) => p.inspectorId === user.id);
  if (input.participantId) mine = mine.filter((p) => p.id === input.participantId);
  if (mine.length === 0) {
    throw new AppError({ message: "You are not an assigned inspector here", status: 403, code: "FORBIDDEN" });
  }
  const participant = mine[0];
  if (mine.length > 1 && !input.participantId) {
    throw new AppError({
      message: "You are assigned to multiple departments — pick a participantId",
      status: 400,
      code: "PARTICIPANT_REQUIRED",
    });
  }

  const observation = await prisma.inspectionObservation.create({
    data: {
      inspectionId,
      participantId: participant.id,
      inspectorId: user.id,
      compliant: input.compliant,
      notes: input.notes,
    },
  });
  await prisma.inspectionParticipant.update({
    where: { id: participant.id },
    data: { observedAt: new Date() },
  });

  await recordEvent({
    applicationId: inspection.applicationId,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "INSPECTION_OBSERVED",
    comment: input.notes.slice(0, 300),
    metadata: { inspectionId, participantId: participant.id, compliant: input.compliant },
  });
  return observation;
}

export const COMPLIANCE_STATUSES = ["COMPLIANT", "DEFICIENT", "NON_COMPLIANT"] as const;

/** Wraps up the visit with a consolidated report + compliance verdict. */
export async function completeInspection(
  user: AuthUser,
  inspectionId: string,
  input: { findings: string; complianceStatus: string },
) {
  assertOfficer(user);
  const inspection = await loadInspection(inspectionId);
  if (inspection.status !== "IN_PROGRESS") {
    throw new AppError({
      message: `Cannot complete — inspection is ${inspection.status}`,
      status: 409,
      code: "BAD_STATE",
    });
  }
  if (!COMPLIANCE_STATUSES.includes(input.complianceStatus as (typeof COMPLIANCE_STATUSES)[number])) {
    throw new AppError({ message: "Invalid compliance status", status: 400, code: "VALIDATION_ERROR" });
  }

  const completed = await prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      findings: input.findings,
      complianceStatus: input.complianceStatus,
    },
  });

  await recordEvent({
    applicationId: inspection.applicationId,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "INSPECTION_COMPLETED",
    fromStatus: "IN_PROGRESS",
    toStatus: "COMPLETED",
    comment: `${input.complianceStatus} — ${input.findings.slice(0, 300)}`,
    metadata: { inspectionId, complianceStatus: input.complianceStatus },
  });

  const app = await prisma.application.findUnique({
    where: { id: inspection.applicationId },
    select: { createdById: true, applicationNo: true },
  });
  if (app) {
    await createNotification({
      userId: app.createdById,
      type: "INSPECTION",
      title: "Inspection completed",
      message: `${inspection.title} (${app.applicationNo}) — ${input.complianceStatus}. ${input.findings.slice(0, 160)}`,
      data: { inspectionId, applicationId: inspection.applicationId },
    });
  }
  const assigned = inspection.participants.filter((p) => p.inspectorId && p.inspectorId !== user.id);
  for (const p of assigned) {
    await createNotification({
      userId: p.inspectorId as string,
      type: "INSPECTION",
      title: "Inspection closed",
      message: `${inspection.title} — ${input.complianceStatus}.`,
      data: { inspectionId, applicationId: inspection.applicationId },
    });
  }

  // Phase 7 — a verdict below COMPLIANT auto-opens a remediation case.
  if (input.complianceStatus !== "COMPLIANT") {
    await openCaseFromInspection({
      id: completed.id,
      applicationId: completed.applicationId,
      unitId: inspection.unitId,
      title: inspection.title,
      findings: completed.findings,
      complianceStatus: input.complianceStatus,
    });
  }
  return completed;
}

/** Cancels a planned/in-progress inspection (weather, unit request, …). */
export async function cancelInspection(user: AuthUser, inspectionId: string, reason: string) {
  assertOfficer(user);
  const inspection = await loadInspection(inspectionId);
  if (inspection.status !== "SCHEDULED" && inspection.status !== "IN_PROGRESS") {
    throw new AppError({
      message: `Cannot cancel — inspection is ${inspection.status}`,
      status: 409,
      code: "BAD_STATE",
    });
  }

  await prisma.inspection.update({ where: { id: inspectionId }, data: { status: "CANCELLED" } });
  await recordEvent({
    applicationId: inspection.applicationId,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "INSPECTION_CANCELLED",
    fromStatus: inspection.status,
    toStatus: "CANCELLED",
    comment: reason || "Cancelled by coordinating officer",
    metadata: { inspectionId },
  });

  const app = await prisma.application.findUnique({
    where: { id: inspection.applicationId },
    select: { createdById: true },
  });
  if (app) {
    await createNotification({
      userId: app.createdById,
      type: "INSPECTION",
      title: "Inspection cancelled",
      message: `${inspection.title} — ${reason || "no reason given"}`,
      data: { inspectionId, applicationId: inspection.applicationId },
    });
  }
  return { success: true };
}

/** Directory of active inspectors for the assignment dropdown. */
export async function listInspectors(user: AuthUser) {
  if (!user.roles.some((r) => READ_ROLES.includes(r))) {
    throw new AppError({ message: "Officer access required", status: 403, code: "FORBIDDEN" });
  }
  const inspectors = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: "INSPECTOR" } } } },
    select: {
      id: true,
      fullName: true,
      email: true,
      department: { select: { id: true, code: true, name: true } },
    },
    orderBy: { fullName: "asc" },
    take: 200,
  });
  return { items: inspectors };
}





