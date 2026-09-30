// ───────────────────────────────────────────────────────────────
// Renewals service (Phase 7) — due/expired approvals, renewal
// applications, pre-expiry alerts and the expiry sweep.
// ───────────────────────────────────────────────────────────────
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { type AuthUser } from "../middleware/auth.js";
import { createNotification } from "../services/notifications.service.js";
import { applicationNo } from "../services/applications.service.js";
import { recordEvent } from "../workflow/runtime.service.js";
import { Prisma } from "@prisma/client";

const OFFICER_ROLES = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"];
/** Pre-expiry alert window — mirrors MH_MPCB_RENEWAL_001 (alert_before_expiry_days: 60). */
export const DEFAULT_ALERT_DAYS = 60;
/** Application statuses after which no renewal is pending any more. */
const TERMINAL_STATUSES = ["APPROVED", "REJECTED", "WITHDRAWN"];

function isOfficer(user: AuthUser): boolean {
  return user.roles.some((r) => OFFICER_ROLES.includes(r));
}

/** Unit ids the caller belongs to. Officers see everything (null = unscoped). */
async function visibleUnitIds(user: AuthUser): Promise<string[] | null> {
  if (isOfficer(user)) return null;
  const rows = await prisma.unitMember.findMany({ where: { userId: user.id }, select: { unitId: true } });
  return rows.map((r) => r.unitId);
}

async function unitMemberIds(unitId: string): Promise<string[]> {
  const rows = await prisma.unitMember.findMany({ where: { unitId }, select: { userId: true } });
  return [...new Set(rows.map((r) => r.userId))];
}

function daysLeft(validTill: Date | null): number | null {
  if (!validTill) return null;
  return Math.ceil((validTill.getTime() - Date.now()) / 86400000);
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

/** Lifecycle state for the UI badges. */
function lifecycleState(status: string, left: number | null): "CURRENT" | "DUE_SOON" | "EXPIRED" | "REVOKED" | "NO_EXPIRY" {
  if (status === "REVOKED") return "REVOKED";
  if (status === "EXPIRED" || (left !== null && left < 0)) return "EXPIRED";
  if (left === null) return "NO_EXPIRY";
  return left <= DEFAULT_ALERT_DAYS ? "DUE_SOON" : "CURRENT";
}
/**
 * Approvals that need renewal attention: expiring within `days`
 * (default 60) or already lapsed. Applicants only see their units.
 */
export async function listDueRenewals(user: AuthUser, days: number = DEFAULT_ALERT_DAYS) {
  const scope = await visibleUnitIds(user);
  const horizon = new Date(Date.now() + days * 86400000);
  const items = await prisma.approval.findMany({
    where: {
      ...(scope ? { unitId: { in: scope } } : {}),
      OR: [
        { status: "ACTIVE", validTill: { not: null, lte: horizon } },
        { status: "EXPIRED" },
      ],
    },
    include: {
      approvalType: { select: { code: true, name: true, validityDays: true } },
      unit: { select: { id: true, name: true, district: true, state: true } },
      renewalApplication: { select: { id: true, applicationNo: true, status: true } },
    },
    orderBy: [{ validTill: "asc" }],
    take: 200,
  });

  // Open compliance cases block renewal — surface the count per unit.
  const caseCounts = await prisma.complianceCase.groupBy({
    by: ["unitId"],
    where: { unitId: { in: items.map((a) => a.unitId) }, status: { in: ["OPEN", "REMEDIATED"] } },
    _count: { _all: true },
  });
  const openCases = new Map(caseCounts.map((c) => [c.unitId, c._count._all]));

  return {
    alertDays: days,
    items: items.map((a) => {
      const left = daysLeft(a.validTill);
      const pending = a.renewalApplication && !TERMINAL_STATUSES.includes(a.renewalApplication.status);
      return {
        id: a.id,
        approvalNo: a.approvalNo,
        status: a.status,
        state: lifecycleState(a.status, left),
        issuedAt: a.issuedAt,
        validTill: a.validTill,
        daysLeft: left,
        renewedAt: a.renewedAt,
        renewalCount: a.renewalCount,
        renewalAlertAt: a.renewalAlertAt,
        approvalType: a.approvalType,
        unit: a.unit,
        renewalApplication: a.renewalApplication,
        hasPendingRenewal: Boolean(pending),
        openComplianceCases: openCases.get(a.unitId) ?? 0,
      };
    }),
  };
}
/**
 * Everything the applicant needs before renewing: countdown, pending
 * renewal, open compliance cases and explicit blockers.
 */
export async function getRenewalReadiness(user: AuthUser, approvalId: string) {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: {
      approvalType: { select: { code: true, name: true, validityDays: true } },
      unit: { select: { id: true, name: true, district: true, state: true } },
      renewalApplication: { select: { id: true, applicationNo: true, status: true, createdAt: true } },
      application: { select: { applicationNo: true } },
    },
  });
  if (!approval) {
    throw new AppError({ message: "Approval not found", status: 404, code: "NOT_FOUND" });
  }
  const scope = await visibleUnitIds(user);
  if (scope && !scope.includes(approval.unitId)) {
    // Don't leak approvals the caller can't see.
    throw new AppError({ message: "Approval not found", status: 404, code: "NOT_FOUND" });
  }

  const openComplianceCases = await prisma.complianceCase.count({
    where: { unitId: approval.unitId, status: { in: ["OPEN", "REMEDIATED"] } },
  });
  const pendingRenewal =
    approval.renewalApplication && !TERMINAL_STATUSES.includes(approval.renewalApplication.status)
      ? approval.renewalApplication
      : null;

  const blockers: { code: string; message: string }[] = [];
  if (approval.status === "REVOKED") {
    blockers.push({ code: "APPROVAL_REVOKED", message: "A revoked approval cannot be renewed" });
  }
  if (pendingRenewal) {
    blockers.push({
      code: "RENEWAL_PENDING",
      message: `Renewal ${pendingRenewal.applicationNo} is already ${pendingRenewal.status}`,
    });
  }
  if (openComplianceCases > 0) {
    blockers.push({
      code: "OPEN_COMPLIANCE_CASE",
      message: `${openComplianceCases} open compliance case(s) must be remediated first`,
    });
  }

  const left = daysLeft(approval.validTill);
  return {
    approval: {
      id: approval.id,
      approvalNo: approval.approvalNo,
      status: approval.status,
      issuedAt: approval.issuedAt,
      validTill: approval.validTill,
      renewedAt: approval.renewedAt,
      renewalCount: approval.renewalCount,
      renewalAlertAt: approval.renewalAlertAt,
      approvalType: approval.approvalType,
      unit: approval.unit,
      originalApplicationNo: approval.application.applicationNo,
    },
    daysLeft: left,
    state: lifecycleState(approval.status, left),
    openComplianceCases,
    pendingRenewal,
    blockers,
    canRenew: blockers.length === 0,
  };
}
/**
 * Opens a renewal application for an approval. The draft inherits the
 * original application's form data; both sides get linked so duplicate
 * renewals can be detected and the approval is extended on completion.
 */
export async function createRenewalApplication(user: AuthUser, approvalId: string) {
  const readiness = await getRenewalReadiness(user, approvalId);
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: {
      application: { select: { formData: true, riskCategory: true } },
      approvalType: { select: { name: true } },
    },
  });
  if (!approval) {
    throw new AppError({ message: "Approval not found", status: 404, code: "NOT_FOUND" });
  }

  // Renewals are filed by the unit's own members (officers don't renew).
  const member = await prisma.unitMember.findUnique({
    where: { unitId_userId: { unitId: approval.unitId, userId: user.id } },
    select: { id: true },
  });
  if (!member) {
    throw new AppError({ message: "Only the unit's members can renew this approval", status: 403, code: "FORBIDDEN" });
  }
  if (readiness.blockers.length > 0) {
    throw new AppError({
      message: readiness.blockers[0].message,
      status: 409,
      code: readiness.blockers[0].code,
      details: { blockers: readiness.blockers },
    });
  }

  const created = await prisma.application.create({
    data: {
      applicationNo: applicationNo(),
      approvalTypeId: approval.approvalTypeId,
      unitId: approval.unitId,
      createdById: user.id,
      formData: approval.application.formData as Prisma.InputJsonValue,
      riskCategory: approval.application.riskCategory,
      linkedApprovalId: approval.id,
      status: "DRAFT",
    },
  });
  await prisma.approval.update({ where: { id: approval.id }, data: { renewalApplicationId: created.id } });

  await recordEvent({
    applicationId: created.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "RENEWAL_REQUESTED",
    fromStatus: "DRAFT",
    toStatus: "DRAFT",
    comment: `Renewal of ${approval.approvalNo} (${approval.approvalType.name})`,
    metadata: { approvalId: approval.id, approvalNo: approval.approvalNo },
  });
  await createNotification({
    userId: user.id,
    type: "RENEWAL",
    title: "Renewal draft created",
    message: `Renewal of ${approval.approvalNo} started — attach documents and submit (${created.applicationNo}).`,
    data: { applicationId: created.id, approvalId: approval.id },
  });
  return created;
}
/**
 * Background sweep: lapses approvals past their validity and sends one
 * pre-expiry renewal alert per renewal cycle (renewalAlertAt guard).
 * Safe to run repeatedly — every action is idempotent.
 */
export async function runRenewalPass(
  options: { alertDays?: number } = {},
): Promise<{ expired: number; alerts: number }> {
  const alertDays = options.alertDays ?? DEFAULT_ALERT_DAYS;
  const now = new Date();

  // 1) Lapse approvals that are past their validity date.
  const lapsed = await prisma.approval.findMany({
    where: { status: "ACTIVE", validTill: { lt: now } },
    select: { id: true, approvalNo: true, validTill: true, unitId: true },
  });
  for (const a of lapsed) {
    await prisma.approval.update({ where: { id: a.id }, data: { status: "EXPIRED" } });
    for (const userId of await unitMemberIds(a.unitId)) {
      await createNotification({
        userId,
        type: "RENEWAL",
        title: "Approval expired",
        message: `${a.approvalNo} expired on ${fmtDate(a.validTill)} — apply for renewal to continue operations.`,
        data: { approvalId: a.id },
      });
    }
  }

  // 2) Pre-expiry alerts — at most one per renewal cycle, and never
  //    while a renewal is already pending.
  const horizon = new Date(now.getTime() + alertDays * 86400000);
  const due = await prisma.approval.findMany({
    where: {
      status: "ACTIVE",
      validTill: { gte: now, lte: horizon },
      renewalAlertAt: null,
      OR: [{ renewalApplicationId: null }, { renewalApplication: { status: { in: TERMINAL_STATUSES } } }],
    },
    select: { id: true, approvalNo: true, validTill: true, unitId: true },
  });
  for (const a of due) {
    const left = Math.max(1, daysLeft(a.validTill) ?? 0);
    for (const userId of await unitMemberIds(a.unitId)) {
      await createNotification({
        userId,
        type: "RENEWAL",
        title: "Renewal due soon",
        message: `${a.approvalNo} expires in ${left} day(s) on ${fmtDate(a.validTill)} — apply for renewal.`,
        data: { approvalId: a.id },
      });
    }
    await prisma.approval.update({ where: { id: a.id }, data: { renewalAlertAt: now } });
  }

  return { expired: lapsed.length, alerts: due.length };
}
