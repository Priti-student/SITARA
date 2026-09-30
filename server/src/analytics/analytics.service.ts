// ───────────────────────────────────────────────────────────────
// Analytics service (Phase 9) — role-aware dashboards: KPI cards,
// status breakdowns, the 6-month application trend and per-
// department workload. Applicants see only their own units.
// ───────────────────────────────────────────────────────────────
import { prisma } from "../utils/prisma.js";
import { type AuthUser } from "../middleware/auth.js";

const OFFICER_ROLES = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "INSPECTOR", "STATE_ADMIN", "SUPER_ADMIN"];

function isOfficer(user: AuthUser): boolean {
  return user.roles.some((r) => OFFICER_ROLES.includes(r));
}

async function memberUnitIds(user: AuthUser): Promise<string[]> {
  const rows = await prisma.unitMember.findMany({ where: { userId: user.id }, select: { unitId: true } });
  return rows.map((r) => r.unitId);
}

/** Turns a groupBy(status) result into a stable {STATUS: count} map. */
function statusMap(grouped: { status: string; _count: { _all: number } }[], seeds: string[] = []) {
  const out: Record<string, number> = {};
  for (const s of seeds) out[s] = 0;
  for (const g of grouped) out[g.status] = g._count._all;
  return out;
}

/** Last `months` calendar months as YYYY-MM keys, oldest first. */
function lastMonths(months: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

const APP_SEEDS = ["DRAFT", "SUBMITTED", "UNDER_SCRUTINY", "QUERY", "APPROVED", "REJECTED", "WITHDRAWN"];

/**
 * One dashboard payload for every role:
 *  - officers → platform-wide totals + department workload
 *  - applicants → scoped to the units they belong to
 */
export async function getOverview(user: AuthUser) {
  const officer = isOfficer(user);
  const scope = officer ? null : await memberUnitIds(user);
  const unitFilter = scope ? { unitId: { in: scope } } : {};

  // 6 calendar months including the current one.
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    units, appGroup, appRecent, activeTracks, overdueTracks,
    inspections, inspectionsDone, renewalsDue, complianceOpen,
    claimGroup, grievanceGroup, deptWorkload,
  ] = await Promise.all([
    prisma.unit.count(scope ? { where: { id: { in: scope } } } : undefined),
    prisma.application.groupBy({ by: ["status"], where: unitFilter, _count: { _all: true } }),
    prisma.application.findMany({
      where: { ...unitFilter, createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    }),
    prisma.workflowInstance.count({ where: { status: "ACTIVE" } }),
    prisma.workflowInstance.count({ where: { status: "ACTIVE", slaDueAt: { not: null, lt: new Date() } } }),
    prisma.inspection.groupBy({
      by: ["status"],
      where: scope ? { unitId: { in: scope } } : {},
      _count: { _all: true },
    }),
    prisma.inspection.count({
      where: { ...(scope ? { unitId: { in: scope } } : {}), status: "COMPLETED" },
    }),
    prisma.approval.count({
      where: {
        ...(scope ? { unitId: { in: scope } } : {}),
        status: "ACTIVE",
        validTill: { not: null, lte: new Date(Date.now() + 60 * 86400000) },
      },
    }),
    prisma.complianceCase.count({ where: { ...(scope ? { unitId: { in: scope } } : {}), status: "OPEN" } }),
    prisma.incentiveClaim.groupBy({ by: ["status"], where: unitFilter, _count: { _all: true } }),
    prisma.grievance.groupBy({
      by: ["status"],
      where: scope ? { OR: [{ createdById: user.id }, { unitId: { in: scope } }] } : {},
      _count: { _all: true },
    }),
    officer
      ? prisma.workflowInstance.groupBy({
          by: ["departmentId"],
          where: { status: "ACTIVE" },
          _count: { _all: true },
        })
      : Promise.resolve([] as { departmentId: string | null; _count: { _all: number } }[]),
  ]);

  const applications = statusMap(appGroup, APP_SEEDS);
  const decided = (applications.APPROVED ?? 0) + (applications.REJECTED ?? 0);
  const approvalRate = decided > 0 ? Math.round(((applications.APPROVED ?? 0) / decided) * 100) : null;

  // 6-month trend: filings vs approvals per calendar month.
  const months = lastMonths(6);
  const trend: { month: string; filed: number; approved: number }[] = months.map((m) => ({ month: m, filed: 0, approved: 0 }));
  const index = new Map(months.map((m, i) => [m, i]));
  for (const a of appRecent) {
    const key = `${a.createdAt.getFullYear()}-${String(a.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const i = index.get(key);
    if (i === undefined) continue;
    trend[i].filed += 1;
    if (a.status === "APPROVED") trend[i].approved += 1;
  }

  // Department workload (officers only) — name each active track.
  let departments: { code: string; name: string; active: number }[] = [];
  if (officer && deptWorkload.length > 0) {
    const ids = deptWorkload.map((d) => d.departmentId).filter((x): x is string => !!x);
    const depts = await prisma.department.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } });
    departments = deptWorkload
      .map((d) => {
        const meta = d.departmentId ? depts.find((x) => x.id === d.departmentId) : undefined;
        return meta ? { code: meta.code, name: meta.name, active: d._count._all } : null;
      })
      .filter((x): x is { code: string; name: string; active: number } => x !== null)
      .sort((a, b) => b.active - a.active);
  }

  const grievanceTotals = grievanceGroup.reduce((a, g) => a + g._count._all, 0);

  return {
    scope: officer ? "PLATFORM" : "MINE",
    kpis: {
      units,
      applications: Object.values(applications).reduce((a, b) => a + b, 0),
      activeTracks,
      overdueTracks,
      inspectionsCompleted: inspectionsDone,
      renewalsDue,
      openComplianceCases: complianceOpen,
      openGrievances: grievanceTotals,
    },
    applications,
    approvalRate,
    inspections: statusMap(inspections, ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
    claims: statusMap(claimGroup, ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "DISBURSED", "UTILISED"]),
    grievances: statusMap(grievanceGroup, ["OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "REJECTED"]),
    trend,
    departments,
    generatedAt: new Date().toISOString(),
  };
}
