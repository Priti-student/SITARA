// ───────────────────────────────────────────────────────────────
// Workflow runtime (Phase 5) — activate/advance/complete + audit.
// ───────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { parseRoute, type WorkflowRoute } from "./types.js";
import { createNotification } from "../services/notifications.service.js";

function addHours(hours: number): Date {
  return new Date(Date.now() + hours * 3600000);
}

export interface EventInput {
  applicationId: string;
  workflowInstanceId?: string;
  actorId?: string;
  actorRole?: string;
  eventType: string;
  fromStatus?: string;
  toStatus?: string;
  comment?: string;
  metadata?: unknown;
}

export async function recordEvent(input: EventInput) {
  return prisma.workflowEvent.create({
    data: {
      applicationId: input.applicationId,
      workflowInstanceId: input.workflowInstanceId ?? null,
      actorId: input.actorId ?? "system",
      actorRole: input.actorRole ?? "SYSTEM",
      eventType: input.eventType,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      comment: input.comment,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata as unknown as Prisma.InputJsonValue }),
    },
  });
}

export async function getRouteForApplication(applicationId: string): Promise<WorkflowRoute> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { approvalType: { select: { workflow: true } } },
  });
  if (!app) return [];
  return parseRoute(app.approvalType.workflow);
}

/** Called on application submit. Creates one instance per track and moves the app to UNDER_SCRUTINY. */
export async function activateApplicationWorkflow(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { approvalType: true },
  });
  if (!app) {
    throw new AppError({ message: "Application not found", status: 404, code: "NOT_FOUND" });
  }
  const route = parseRoute(app.approvalType.workflow);
  const instances = [];
  for (const track of route) {
    const dept = await prisma.department.findUnique({ where: { code: track.dept } });
    if (!dept) continue;
    const first = track.steps[0];
    const instance = await prisma.workflowInstance.create({
      data: {
        applicationId,
        approvalTypeId: app.approvalTypeId,
        departmentId: dept.id,
        status: "ACTIVE",
        currentStepLabel: first?.label,
        currentStepOrder: first?.order,
        slaDueAt: addHours(first?.slaHours ?? 48),
      },
    });
    instances.push(instance);
    await recordEvent({
      applicationId,
      workflowInstanceId: instance.id,
      eventType: "CREATED",
      fromStatus: "SUBMITTED",
      toStatus: "ACTIVE",
      metadata: { dept: track.dept, step: first?.label },
    });
  }
  if (instances.length > 0) {
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "UNDER_SCRUTINY", updatedAt: new Date() },
    });
  }
  return instances;
}

/** Recomputes the application-level status from its workflow instances. */
export async function recalcApplicationStatus(applicationId: string) {
  const instances = await prisma.workflowInstance.findMany({ where: { applicationId } });
  let status = "UNDER_SCRUTINY";
  if (instances.some((i) => i.status === "REJECTED")) {
    status = "REJECTED";
  } else if (instances.some((i) => i.status === "QUERY_WAITING")) {
    status = "QUERY";
  } else if (instances.length > 0 && instances.every((i) => i.status === "COMPLETED")) {
    status = "APPROVED";
  }
  return prisma.application.update({
    where: { id: applicationId },
    data: { status, updatedAt: new Date() },
  });
}

/** Issues the Approval when every track has completed. */
export async function maybeIssueApproval(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { approvalType: true },
  });
  if (!app) return null;
  const open = await prisma.workflowInstance.count({
    where: { applicationId, status: { in: ["ACTIVE", "QUERY_WAITING"] } },
  });
  if (open !== 0 || app.status !== "APPROVED") return null;

  const now = new Date();
  const days = app.approvalType.validityDays;
  const validTill = days ? new Date(now.getTime() + days * 86400000) : null;

  // Phase 7 — a renewal application EXTENDS its existing approval
  // (same certificate number) instead of issuing a new record.
  if (app.linkedApprovalId) {
    const prior = await prisma.approval.findUnique({ where: { id: app.linkedApprovalId } });
    if (!prior) return null;
    const renewal = await prisma.approval.update({
      where: { id: prior.id },
      data: {
        status: "ACTIVE",
        validTill,
        renewedAt: now,
        renewalCount: prior.renewalCount + 1,
        renewalAlertAt: null,
        renewalApplicationId: applicationId,
      },
    });
    await recordEvent({
      applicationId,
      actorRole: "SYSTEM",
      eventType: "RENEWAL_COMPLETED",
      fromStatus: app.status,
      toStatus: "APPROVED",
      comment: `${renewal.approvalNo} renewed${validTill ? ` — valid till ${validTill.toISOString().slice(0, 10)}` : ""}`,
      metadata: { approvalId: renewal.id, renewalCount: renewal.renewalCount },
    });
    await createNotification({
      userId: app.createdById,
      type: "RENEWAL",
      title: "Approval renewed",
      message: `${renewal.approvalNo} renewed${validTill ? ` · valid till ${validTill.toISOString().slice(0, 10)}` : ""}.`,
      data: { applicationId, approvalId: renewal.id },
    });
    return renewal;
  }

  const already = await prisma.approval.count({ where: { applicationId } });
  if (already > 0) return null;
  const approval = await prisma.approval.create({
    data: {
      approvalNo: `APR-${now.getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      applicationId,
      approvalTypeId: app.approvalTypeId,
      unitId: app.unitId,
      status: "ACTIVE",
      issuedAt: now,
      validTill,
    },
  });

  await createNotification({
    userId: app.createdById,
    type: "APPLICATION",
    title: "Application approved",
    message: `${approval.approvalNo} for ${app.approvalType.name} issued${validTill ? ` · valid till ${validTill.toISOString().slice(0, 10)}` : ""}.`,
    data: { applicationId, approvalId: approval.id },
  });
  return approval;
}

/** Informs officers (STATE_ADMIN) of escalations/SLA breaches. */
export async function notifyStateAdmins(title: string, message: string, data: Record<string, unknown>) {
  const admins = await prisma.user.findMany({
    where: { roles: { some: { role: { name: "STATE_ADMIN" } } } },
    select: { id: true },
  });
  for (const admin of admins) {
    await createNotification({ userId: admin.id, type: "GRIEVANCE", title, message, data });
  }
}