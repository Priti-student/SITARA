// ───────────────────────────────────────────────────────────────
// Alerts service (Phase 9) — one severity-ranked feed combining
// SLA breaches, expiring renewals, compliance deadlines, open
// claims and grievance escalations. Scoped to the caller's units.
// ───────────────────────────────────────────────────────────────
import { prisma } from "../utils/prisma.js";
import { type AuthUser } from "../middleware/auth.js";

const OFFICER_ROLES = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "INSPECTOR", "STATE_ADMIN", "SUPER_ADMIN"];

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AlertItem {
  /** Stable key so the UI can de-duplicate / key rows. */
  key: string;
  severity: AlertSeverity;
  category: "SLA" | "RENEWAL" | "COMPLIANCE" | "GRIEVANCE" | "INCENTIVE" | "APPLICATION";
  title: string;
  message: string;
  /** Deep-link hint for the SPA (route path). */
  href: string;
  count?: number;
  raisedAt: string;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function isOfficer(user: AuthUser): boolean {
  return user.roles.some((r) => OFFICER_ROLES.includes(r));
}

async function memberUnitIds(user: AuthUser): Promise<string[]> {
  const rows = await prisma.unitMember.findMany({ where: { userId: user.id }, select: { unitId: true } });
  return rows.map((r) => r.unitId);
}

/**
 * Builds the consolidated alert feed. Officers see platform-level
 * signals (SLA breaches, overdue grievances); applicants only see
 * what touches their own units and filings.
 */
export async function getAlerts(user: AuthUser, limit = 50) {
  const officer = isOfficer(user);
  const scope = officer ? null : await memberUnitIds(user);
  const unitWhere = scope ? { unitId: { in: scope } } : {};
  const empty = scope !== null && scope.length === 0; // no units → nothing unit-linked
  const now = new Date();
  const alerts: AlertItem[] = [];

  // ── SLA breaches: active workflow tracks past their due date ──
  if (officer) {
    const breached = await prisma.workflowInstance.count({
      where: { status: "ACTIVE", slaDueAt: { not: null, lt: now } },
    });
    if (breached > 0) {
      alerts.push({
        key: "sla-breach",
        severity: "CRITICAL",
        category: "SLA",
        title: `${breached} workflow track(s) past SLA`,
        message: "Active department tracks have exceeded their SLA and need immediate attention.",
        href: "/department",
        count: breached,
        raisedAt: now.toISOString(),
      });
    }
  }

  // ── Applications awaiting a query response ──
  const queries = empty
    ? 0
    : await prisma.application.count({ where: { status: "QUERY", ...unitWhere } });
  if (queries > 0) {
    alerts.push({
      key: "queries-pending",
      severity: "HIGH",
      category: "APPLICATION",
      title: `${queries} application(s) have an open department query`,
      message: "Queries pause the workflow clock — respond to keep the SLA moving.",
      href: "/applications",
      count: queries,
      raisedAt: now.toISOString(),
    });
  }

  // ── Renewals: expired approvals + expiring within 7 days ──
  if (!empty) {
    const expired = await prisma.approval.count({ where: { ...unitWhere, status: "EXPIRED" } });
    if (expired > 0) {
      alerts.push({
        key: "renewal-expired",
        severity: "CRITICAL",
        category: "RENEWAL",
        title: `${expired} approval(s) have expired`,
        message: "Expired approvals block operations — file renewal applications.",
        href: "/renewals",
        count: expired,
        raisedAt: now.toISOString(),
      });
    }
    const week = await prisma.approval.count({
      where: {
        ...unitWhere,
        status: "ACTIVE",
        validTill: { not: null, gte: now, lte: new Date(now.getTime() + 7 * 86400000) },
      },
    });
    if (week > 0) {
      alerts.push({
        key: "renewal-7d",
        severity: "HIGH",
        category: "RENEWAL",
        title: `${week} approval(s) expire within 7 days`,
        message: "Apply for renewal before the validity window closes.",
        href: "/renewals",
        count: week,
        raisedAt: now.toISOString(),
      });
    }

    // ── Compliance cases past their remediation deadline ──
    const overdue = await prisma.complianceCase.count({
      where: { ...unitWhere, status: "OPEN", remediationDueAt: { not: null, lt: now } },
    });
    if (overdue > 0) {
      alerts.push({
        key: "compliance-overdue",
        severity: "CRITICAL",
        category: "COMPLIANCE",
        title: `${overdue} remediation deadline(s) missed`,
        message: "Open compliance cases are past their remediation due date.",
        href: "/compliance",
        count: overdue,
        raisedAt: now.toISOString(),
      });
    }
  }

  // ── Grievances escalated / past response SLA ──
  const grievanceScope = scope ? { OR: [{ createdById: user.id }, { unitId: { in: scope } }] } : {};
  const escalated = await prisma.grievance.count({ where: { ...grievanceScope, status: "ESCALATED" } });
  if (escalated > 0) {
    alerts.push({
      key: "grievance-escalated",
      severity: officer ? "CRITICAL" : "HIGH",
      category: "GRIEVANCE",
      title: `${escalated} grievance(s) escalated`,
      message: officer
        ? "Escalated grievances are waiting on a higher-level response."
        : "Your escalated grievances are awaiting a higher-level response.",
      href: "/grievances",
      count: escalated,
      raisedAt: now.toISOString(),
    });
  }
  const grievanceOverdue = await prisma.grievance.count({
    where: { ...grievanceScope, status: { in: ["OPEN", "IN_PROGRESS"] }, slaDueAt: { lt: now } },
  });
  if (grievanceOverdue > 0) {
    alerts.push({
      key: "grievance-sla",
      severity: "HIGH",
      category: "GRIEVANCE",
      title: `${grievanceOverdue} grievance response SLA(s) missed`,
      message: "These grievances are past their response deadline and will auto-escalate.",
      href: "/grievances",
      count: grievanceOverdue,
      raisedAt: now.toISOString(),
    });
  }

  // ── Incentive claims waiting on review ──
  if (!empty) {
    const claimsWaiting = await prisma.incentiveClaim.count({ where: { ...unitWhere, status: "SUBMITTED" } });
    if (claimsWaiting > 0) {
      alerts.push({
        key: "claims-awaiting-review",
        severity: "MEDIUM",
        category: "INCENTIVE",
        title: `${claimsWaiting} incentive claim(s) awaiting review`,
        message: "Submitted claims are queued for officer review.",
        href: "/claims",
        count: claimsWaiting,
        raisedAt: now.toISOString(),
      });
    }
  }

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const items = alerts.slice(0, limit);
  const summary = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, total: items.length };
  for (const a of items) summary[a.severity] += 1;
  return { items, summary };
}
