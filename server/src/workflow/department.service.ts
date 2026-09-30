// ───────────────────────────────────────────────────────────────
// Department service (Phase 5) — inbox + officer actions.
// ───────────────────────────────────────────────────────────────
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { nextStep, trackForDept } from "./types.js";
import {
  getRouteForApplication,
  maybeIssueApproval,
  notifyStateAdmins,
  recalcApplicationStatus,
  recordEvent,
} from "../workflow/runtime.service.js";
import { createNotification } from "../services/notifications.service.js";
import { type AuthUser } from "../middleware/auth.js";

const OFFICER_ROLES = ["DEPARTMENT_USER", "APPROVING_AUTHORITY"];

function addHours(hours: number, from = new Date()): Date {
  return new Date(from.getTime() + hours * 3600000);
}

function isOfficer(user: AuthUser): boolean {
  return user.roles.some((r) => OFFICER_ROLES.includes(r)) || user.roles.includes("SUPER_ADMIN") || user.roles.includes("STATE_ADMIN");
}

/** Department inbox with SLA flags. */
export async function inbox(user: AuthUser, filters: { status?: string } = {}) {
  const deptId = (await prisma.user.findUnique({
    where: { id: user.id },
    select: { departmentId: true },
  }))?.departmentId;

  const isAdmin = user.roles.includes("SUPER_ADMIN") || user.roles.includes("STATE_ADMIN");
  const where: Record<string, unknown> = { status: { in: ["ACTIVE", "QUERY_WAITING"] } };
  if (!isAdmin) {
    if (!deptId) return { items: [], myDepartment: null, counts: { active: 0, queries: 0, overdue: 0 } };
    where.departmentId = deptId;
  }
  if (filters.status) where.status = filters.status;

  const instances = await prisma.workflowInstance.findMany({
    where,
    include: {
      department: { select: { code: true, name: true } },
      application: {
        select: {
          id: true,
          applicationNo: true,
          status: true,
          riskCategory: true,
          createdAt: true,
          submittedAt: true,
          approvalType: { select: { code: true, name: true } },
          unit: { select: { name: true, district: true } },
          _count: { select: { documents: true } },
        },
      },
    },
    orderBy: [{ slaDueAt: "asc" }],
    take: 200,
  });

  const now = Date.now();
  const items = instances.map((inst) => ({
    id: inst.id,
    department: inst.department,
    currentStepLabel: inst.currentStepLabel,
    status: inst.status,
    slaDueAt: inst.slaDueAt,
    overdue: inst.slaDueAt !== null && inst.slaDueAt.getTime() < now,
    dueSoon: inst.slaDueAt !== null && inst.slaDueAt.getTime() < now + 24 * 3600000,
    escalated: inst.escalatedAt !== null,
    application: inst.application,
  }));

  const dept = deptId ? await prisma.department.findUnique({ where: { id: deptId } }) : null;
  return {
    items,
    myDepartment: dept ? { code: dept.code, name: dept.name } : null,
    counts: {
      active: items.filter((i) => i.status === "ACTIVE").length,
      queries: items.filter((i) => i.status === "QUERY_WAITING").length,
      overdue: items.filter((i) => i.overdue).length,
    },
  };
}

/** Full department view of an application (instances + route + events + documents). */
export async function viewApplication(user: AuthUser, applicationId: string) {
  if (!isOfficer(user)) {
    throw new AppError({ message: "Officer access required", status: 403, code: "FORBIDDEN" });
  }
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      approvalType: { include: { requirements: { include: { documentType: true } } } },
      unit: { select: { id: true, name: true, registrationNo: true, district: true, state: true } },
      documents: { include: { documentType: true }, orderBy: { createdAt: "asc" } },
      workflowInstances: {
        include: { department: { select: { code: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      events: { orderBy: { createdAt: "asc" } },
      approvals: true,
      riskAssessment: true,
      inspections: {
        include: {
          participants: {
            include: {
              department: { select: { code: true, name: true } },
              inspector: { select: { fullName: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          _count: { select: { observations: true } },
        },
        orderBy: { scheduledAt: "asc" },
      },
    },
  });
  if (!app) {
    throw new AppError({ message: "Application not found", status: 404, code: "NOT_FOUND" });
  }
  return app;
}

/** Asserts the user may act on an instance's department + step role. */
async function authorizeForInstance(user: AuthUser, instanceId: string) {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: { department: { select: { code: true } } },
  });
  if (!instance) {
    throw new AppError({ message: "Workflow instance not found", status: 404, code: "NOT_FOUND" });
  }
  if (instance.status !== "ACTIVE") {
    throw new AppError({ message: `Instance is ${instance.status}; no action possible`, status: 409, code: "WORKFLOW_LOCKED" });
  }
  const isAdmin = user.roles.includes("SUPER_ADMIN") || user.roles.includes("STATE_ADMIN");
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { departmentId: true } });
  if (!isAdmin && profile?.departmentId !== instance.departmentId) {
    throw new AppError({ message: "Not your department's case", status: 403, code: "FORBIDDEN" });
  }
  return instance;
}

function requiresStepRole(role: string, user: AuthUser): void {
  const allowed = user.roles.includes("SUPER_ADMIN") || user.roles.includes("STATE_ADMIN") || user.roles.includes(role);
  if (!allowed) {
    throw new AppError({ message: `Step requires role ${role}`, status: 403, code: "FORBIDDEN" });
  }
}

export async function approveStep(user: AuthUser, instanceId: string, comment: string) {
  const instance = await authorizeForInstance(user, instanceId);
  const route = await getRouteForApplication(instance.applicationId);
  const track = trackForDept(route, instance.department.code);
  const current = track?.steps.find((s) => s.order === instance.currentStepOrder);
  if (current) requiresStepRole(current.role, user);

  const nxt = nextStep(track, instance.currentStepOrder);
  await recordEvent({
    applicationId: instance.applicationId,
    workflowInstanceId: instance.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "APPROVED",
    fromStatus: instance.status,
    toStatus: nxt ? `STEP:${nxt.label}` : "COMPLETED",
    comment: comment || `Approved: ${current?.label ?? "step"}`,
  });

  if (nxt) {
    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: {
        currentStepLabel: nxt.label,
        currentStepOrder: nxt.order,
        slaDueAt: addHours(nxt.slaHours),
        status: "ACTIVE",
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: { status: "COMPLETED", completedAt: new Date(), slaDueAt: null, updatedAt: new Date() },
    });
  }
  const app = await recalcApplicationStatus(instance.applicationId);
  if (app.status === "APPROVED") await maybeIssueApproval(instance.applicationId);
  return { success: true, status: nxt ? "STEP_ADVANCED" : "TRACK_COMPLETED" };
}

export async function rejectApplication(user: AuthUser, instanceId: string, reason: string) {
  const instance = await authorizeForInstance(user, instanceId);
  await recordEvent({
    applicationId: instance.applicationId,
    workflowInstanceId: instance.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "REJECTED",
    fromStatus: instance.status,
    toStatus: "REJECTED",
    comment: reason || "Rejected",
  });
  await prisma.workflowInstance.update({
    where: { id: instance.id },
    data: { status: "REJECTED", completedAt: new Date(), slaDueAt: null, updatedAt: new Date() },
  });
  // Mark sibling tracks closed so the app is not stuck
  await prisma.workflowInstance.updateMany({
    where: { applicationId: instance.applicationId, status: "ACTIVE" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  const app = await recalcApplicationStatus(instance.applicationId);
  const applicantId = (await prisma.application.findUnique({ where: { id: instance.applicationId }, select: { createdById: true } }))?.createdById;
  if (applicantId) {
    await createNotification({
      userId: applicantId,
      type: "APPLICATION",
      title: "Application rejected",
      message: `${app.applicationNo} was rejected. Reason: ${reason || "see department note"}.`,
      data: { applicationId: instance.applicationId },
    });
  }
  return { success: true };
}

export async function raiseQuery(user: AuthUser, instanceId: string, question: string) {
  const instance = await authorizeForInstance(user, instanceId);
  await recordEvent({
    applicationId: instance.applicationId,
    workflowInstanceId: instance.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "QUERY_RAISED",
    fromStatus: instance.status,
    toStatus: "QUERY_WAITING",
    comment: question,
  });
  await prisma.workflowInstance.update({
    where: { id: instance.id },
    data: { status: "QUERY_WAITING", updatedAt: new Date() },
  });
  const app = await recalcApplicationStatus(instance.applicationId);
  const applicantId = (await prisma.application.findUnique({ where: { id: instance.applicationId }, select: { createdById: true } }))?.createdById;
  if (applicantId && question) {
    await createNotification({
      userId: applicantId,
      type: "QUERY",
      title: `Query on ${app.applicationNo}`,
      message: question,
      data: { applicationId: instance.applicationId },
    });
  }
  return { success: true };
}

export async function escalate(user: AuthUser, instanceId: string, reason: string) {
  const instance = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
  if (!instance) {
    throw new AppError({ message: "Workflow instance not found", status: 404, code: "NOT_FOUND" });
  }
  if (instance.status !== "ACTIVE") {
    throw new AppError({ message: "Only active items can be escalated", status: 409, code: "WORKFLOW_LOCKED" });
  }
  await recordEvent({
    applicationId: instance.applicationId,
    workflowInstanceId: instance.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "ESCALATED",
    fromStatus: instance.status,
    toStatus: "ACTIVE",
    comment: reason || "Escalated to state coordination",
  });
  await prisma.workflowInstance.update({
    where: { id: instance.id },
    data: { escalatedAt: new Date(), updatedAt: new Date() },
  });
  await notifyStateAdmins(
    "Manual escalation",
    `Case escalated: ${instance.currentStepLabel ?? "step"} for ${user.email}`,
    { applicationId: instance.applicationId, instanceId: instance.id }
  );
  return { success: true };
}

/** Applicant responds to a query — resumes the track. */
export async function respondToQuery(user: AuthUser, applicationId: string, response: string) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, createdById: user.id },
  });
  if (!application) {
    throw new AppError({ message: "Application not found", status: 404, code: "NOT_FOUND" });
  }
  if (application.status !== "QUERY") {
    throw new AppError({ message: "There is no open query to respond to", status: 409, code: "NO_OPEN_QUERY" });
  }
  const waiting = await prisma.workflowInstance.findMany({
    where: { applicationId, status: "QUERY_WAITING" },
    include: { department: { select: { code: true } } },
  });
  for (const instance of waiting) {
    const route = await getRouteForApplication(applicationId);
    const track = trackForDept(route, instance.department.code);
    const step = track?.steps.find((s) => s.order === instance.currentStepOrder);
await recordEvent({
      applicationId,
      workflowInstanceId: instance.id,
      actorId: user.id,
      actorRole: "APPLICANT",
      eventType: "QUERY_RESPONDED",
      fromStatus: "QUERY_WAITING",
      toStatus: "ACTIVE",
      comment: response,
    });
    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: { status: "ACTIVE", slaDueAt: addHours(step?.slaHours ?? 48), updatedAt: new Date() },
    });
  }
  const app = await recalcApplicationStatus(applicationId);
  return { success: true, status: app.status };
}