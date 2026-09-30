// ───────────────────────────────────────────────────────────────
// Grievances service (Phase 9) — filing, officer handling and
// escalation: OPEN → IN_PROGRESS → RESOLVED / REJECTED, with
// ESCALATED as a side-state (manual or SLA-driven auto-escalation).
// ───────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { type AuthUser } from "../middleware/auth.js";
import { createNotification } from "../services/notifications.service.js";

const OFFICER_ROLES = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"];
/** Response SLA by priority (days) — the auto-escalation sweep fires after it. */
export const SLA_DAYS: Record<string, number> = { HIGH: 2, MEDIUM: 5, LOW: 10 };
export const CATEGORIES = ["SERVICE_DELAY", "PROCESS_ISSUE", "CORRUPTION_REPORT", "OTHER"];
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const CLOSED_STATUSES = ["RESOLVED", "REJECTED"];

function isOfficer(user: AuthUser): boolean {
  return user.roles.some((r) => OFFICER_ROLES.includes(r));
}

async function memberUnitIds(user: AuthUser): Promise<string[]> {
  const rows = await prisma.unitMember.findMany({ where: { userId: user.id }, select: { unitId: true } });
  return rows.map((r) => r.unitId);
}

function referenceNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `GRV-${y}${m}${day}-${rand}`;
}

function badState(expected: string, actual: string): AppError {
  return new AppError({
    message: `Grievance must be ${expected} (currently ${actual})`,
    status: 409,
    code: "BAD_STATE",
    details: { expected, actual },
  });
}

/** Notifies every active state/platform admin (the escalation inbox). */
async function notifyStateAdmins(input: { title: string; message: string; data?: unknown }): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["STATE_ADMIN", "SUPER_ADMIN"] } } } } },
    select: { id: true },
  });
  for (const a of admins) {
    await createNotification({ userId: a.id, type: "GRIEVANCE", ...input });
  }
}

async function notifyUser(userId: string, input: { title: string; message: string; data?: unknown }): Promise<void> {
  await createNotification({ userId, type: "GRIEVANCE", ...input });
}

async function recordEvent(input: {
  grievanceId: string;
  actorId?: string;
  actorRole?: string;
  eventType: string;
  comment?: string;
  metadata?: unknown;
}) {
  return prisma.grievanceEvent.create({
    data: {
      grievanceId: input.grievanceId,
      actorId: input.actorId ?? "system",
      actorRole: input.actorRole ?? "SYSTEM",
      eventType: input.eventType,
      comment: input.comment ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata as object }),
    },
  });
}

/**
 * Loads a grievance with visibility enforced: officers see everything,
 * everyone else only their own filings (or their units') — else 404.
 */
async function loadGrievance(user: AuthUser, grievanceId: string) {
  const grievance = await prisma.grievance.findUnique({
    where: { id: grievanceId },
    include: {
      unit: { select: { id: true, name: true, district: true, state: true } },
      application: { select: { id: true, applicationNo: true, status: true } },
      creator: { select: { id: true, fullName: true } },
      assignee: { select: { id: true, fullName: true } },
    },
  });
  if (!grievance) {
    throw new AppError({ message: "Grievance not found", status: 404, code: "NOT_FOUND" });
  }
  if (isOfficer(user)) return grievance;
  if (grievance.createdById === user.id) return grievance;
  const member = grievance.unitId
    ? await prisma.unitMember.findFirst({ where: { unitId: grievance.unitId, userId: user.id } })
    : null;
  if (!member) {
    throw new AppError({ message: "Grievance not found", status: 404, code: "NOT_FOUND" });
  }
  return grievance;
}

/**
 * Lists grievances + status counts. Officers see everything; filers see
 * their own (plus grievances on their units).
 */
export async function listGrievances(
  user: AuthUser,
  filters: { status?: string; category?: string; priority?: string } = {},
) {
  const where: Record<string, unknown> = {};
  if (isOfficer(user)) {
    // unscoped
  } else {
    const scope = await memberUnitIds(user);
    where.OR = [{ createdById: user.id }, ...(scope.length > 0 ? [{ unitId: { in: scope } }] : [])];
  }
  const filtered: Record<string, unknown> = { ...where };
  if (filters.status) filtered.status = filters.status;
  if (filters.category) filtered.category = filters.category;
  if (filters.priority) filtered.priority = filters.priority;

  const [items, grouped] = await Promise.all([
    prisma.grievance.findMany({
      where: filtered,
      include: {
        unit: { select: { id: true, name: true, district: true, state: true } },
        application: { select: { id: true, applicationNo: true, status: true } },
        creator: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.grievance.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  const counts: Record<string, number> = {
    OPEN: 0, IN_PROGRESS: 0, ESCALATED: 0, RESOLVED: 0, REJECTED: 0, total: 0,
  };
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    counts.total += g._count._all;
  }
  return {
    items: items.map((g) => ({
      ...g,
      overdue: !g.resolvedAt && g.slaDueAt.getTime() < Date.now(),
    })),
    counts,
  };
}

/** Files a new grievance. Applicant/unit side may attach their own unit. */
export async function createGrievance(
  user: AuthUser,
  input: {
    subject: string;
    description: string;
    category: string;
    priority?: string;
    unitId?: string;
    applicationId?: string;
  },
) {
  if (input.unitId && !isOfficer(user)) {
    const member = await prisma.unitMember.findFirst({ where: { unitId: input.unitId, userId: user.id } });
    if (!member) {
      throw new AppError({ message: "Unit not found", status: 404, code: "NOT_FOUND" });
    }
  }
  if (input.applicationId) {
    const app = await prisma.application.findUnique({ where: { id: input.applicationId }, select: { id: true } });
    if (!app) throw new AppError({ message: "Application not found", status: 404, code: "NOT_FOUND" });
  }

  const priority = input.priority ?? "MEDIUM";
  const slaDays = SLA_DAYS[priority] ?? 5;
  const created = await prisma.grievance.create({
    data: {
      referenceNo: referenceNo(),
      subject: input.subject,
      description: input.description,
      category: input.category,
      priority,
      slaDueAt: new Date(Date.now() + slaDays * 86400000),
      unitId: input.unitId ?? null,
      applicationId: input.applicationId ?? null,
      createdById: user.id,
    },
  });
  await recordEvent({
    grievanceId: created.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "GRIEVANCE_FILED",
    comment: input.subject.slice(0, 300),
    metadata: { category: input.category, priority, slaDueAt: created.slaDueAt },
  });
  await notifyStateAdmins({
    title: "New grievance filed",
    message: `${created.referenceNo}: ${created.subject} (respond by ${created.slaDueAt.toISOString().slice(0, 10)}).`,
    data: { grievanceId: created.id },
  });
  return created;
}

/** Detail with the audit timeline + role-aware action flags. */
export async function getGrievance(user: AuthUser, grievanceId: string) {
  const g = await loadGrievance(user, grievanceId);
  const events = await prisma.grievanceEvent.findMany({
    where: { grievanceId: g.id },
    orderBy: { createdAt: "asc" },
  });
  const officer = isOfficer(user);
  const closed = CLOSED_STATUSES.includes(g.status);
  return {
    grievance: { ...g, overdue: !g.resolvedAt && g.slaDueAt.getTime() < Date.now() },
    events,
    can: {
      acknowledge: officer && (g.status === "OPEN" || g.status === "ESCALATED"),
      respond: officer && !closed,
      resolve: officer && !closed,
      escalate: !closed && (officer || g.createdById === user.id),
    },
  };
}

/** Officer acknowledges: OPEN/ESCALATED → IN_PROGRESS (assigns to self). */
export async function acknowledgeGrievance(user: AuthUser, grievanceId: string) {
  const g = await loadGrievance(user, grievanceId);
  if (g.status !== "OPEN" && g.status !== "ESCALATED") throw badState("OPEN or ESCALATED", g.status);

  const updated = await prisma.grievance.update({
    where: { id: g.id },
    data: { status: "IN_PROGRESS", assignedToId: user.id },
  });
  await recordEvent({
    grievanceId: g.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "ACKNOWLEDGED",
    comment: "Assigned to officer — acknowledged",
    metadata: { from: g.status, to: "IN_PROGRESS" },
  });
  await notifyUser(g.createdById, {
    title: "Grievance acknowledged",
    message: `${g.referenceNo} is now under investigation by an officer.`,
    data: { grievanceId: g.id },
  });
  return updated;
}

/** Officer adds a public response (stays open until resolved). */
export async function respondToGrievance(user: AuthUser, grievanceId: string, notes: string) {
  const g = await loadGrievance(user, grievanceId);
  if (CLOSED_STATUSES.includes(g.status)) throw badState("OPEN / IN_PROGRESS / ESCALATED", g.status);

  const updated = await prisma.grievance.update({
    where: { id: g.id },
    data: {
      status: g.status === "OPEN" ? "IN_PROGRESS" : g.status,
      responseNotes: notes,
      respondedAt: new Date(),
      assignedToId: g.assignedToId ?? user.id,
    },
  });
  await recordEvent({
    grievanceId: g.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "RESPONSE_ADDED",
    comment: notes.slice(0, 500),
  });
  await notifyUser(g.createdById, {
    title: "Grievance response received",
    message: `${g.referenceNo}: ${notes.slice(0, 160)}`,
    data: { grievanceId: g.id },
  });
  return updated;
}

/** Officer closes a grievance — resolve (with response) or reject (with reason). */
export async function decideGrievance(
  user: AuthUser,
  grievanceId: string,
  input: { accepted: boolean; notes: string },
) {
  const g = await loadGrievance(user, grievanceId);
  if (CLOSED_STATUSES.includes(g.status)) throw badState("OPEN / IN_PROGRESS / ESCALATED", g.status);

  const status = input.accepted ? "RESOLVED" : "REJECTED";
  const updated = await prisma.grievance.update({
    where: { id: g.id },
    data: {
      status,
      resolvedAt: new Date(),
      responseNotes: input.accepted ? input.notes : g.responseNotes,
    },
  });
  await recordEvent({
    grievanceId: g.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: status === "RESOLVED" ? "RESOLVED" : "REJECTED",
    comment: input.notes.slice(0, 500),
    metadata: { from: g.status, to: status },
  });
  await notifyUser(g.createdById, {
    title: status === "RESOLVED" ? "Grievance resolved" : "Grievance rejected",
    message: `${g.referenceNo}: ${input.notes.slice(0, 160)}`,
    data: { grievanceId: g.id },
  });
  return updated;
}

/**
 * Escalation — the applicant (or any officer) pushes an unresolved
 * grievance up a level. Filer escalation only opens past the SLA.
 */
export async function escalateGrievance(user: AuthUser, grievanceId: string, reason: string) {
  const g = await loadGrievance(user, grievanceId);
  if (CLOSED_STATUSES.includes(g.status)) throw badState("an unresolved grievance", g.status);
  const officer = isOfficer(user);
  if (!officer && g.slaDueAt.getTime() > Date.now()) {
    throw new AppError({
      message: `Escalation opens after the response SLA (${g.slaDueAt.toISOString().slice(0, 10)})`,
      status: 409,
      code: "SLA_NOT_MISSED",
      details: { slaDueAt: g.slaDueAt },
    });
  }

  const updated = await prisma.grievance.update({
    where: { id: g.id },
    data: {
      status: "ESCALATED",
      escalationLevel: g.escalationLevel + 1,
      escalatedAt: new Date(),
      escalationReason: reason,
    },
  });
  await recordEvent({
    grievanceId: g.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "ESCALATED",
    comment: reason.slice(0, 500),
    metadata: { level: g.escalationLevel + 1, from: g.status },
  });
  await notifyStateAdmins({
    title: "Grievance escalated",
    message: `${g.referenceNo} escalated to level ${g.escalationLevel + 1}: ${reason.slice(0, 160)}`,
    data: { grievanceId: g.id },
  });
  return updated;
}

/**
 * Background sweep (Phase 9): auto-escalates grievances whose response
 * SLA has passed while still OPEN/IN_PROGRESS. Idempotent — anything
 * already ESCALATED (or closed) is skipped by the query itself.
 */
export async function runGrievancePass(): Promise<{ checked: number; escalated: number }> {
  const now = new Date();
  const overdue = await prisma.grievance.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] }, slaDueAt: { lt: now } },
    take: 200,
  });
  for (const g of overdue) {
    await prisma.grievance.update({
      where: { id: g.id },
      data: {
        status: "ESCALATED",
        escalationLevel: g.escalationLevel + 1,
        escalatedAt: now,
        escalationReason: "Response SLA missed — auto-escalated",
      },
    });
    await recordEvent({
      grievanceId: g.id,
      eventType: "AUTO_ESCALATED",
      comment: `Response SLA missed (${g.slaDueAt.toISOString().slice(0, 10)}) — escalated to level ${g.escalationLevel + 1}`,
      metadata: { level: g.escalationLevel + 1, slaDueAt: g.slaDueAt },
    });
    await notifyStateAdmins({
      title: "Grievance auto-escalated",
      message: `${g.referenceNo}: response SLA missed — escalated to level ${g.escalationLevel + 1}.`,
      data: { grievanceId: g.id },
    });
    await notifyUser(g.createdById, {
      title: "Grievance escalated (SLA missed)",
      message: `${g.referenceNo} was not answered in time and has been escalated automatically.`,
      data: { grievanceId: g.id },
    });
  }
  return { checked: overdue.length, escalated: overdue.length };
}
