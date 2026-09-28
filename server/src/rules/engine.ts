// ───────────────────────────────────────────────────────────────
// Engine service — loads active rules from PostgreSQL and evaluates
// a unit/profile context into an EvaluationResult.
// ───────────────────────────────────────────────────────────────
import { prisma } from "../utils/prisma.js";
import { evaluateRules } from "./evaluator.js";
import type {
  Condition,
  EvaluationContext,
  EvaluationResult,
  RuleLike,
} from "./types.js";

export interface RuleListFilters {
  ruleType?: string;
  authority?: string;
  q?: string;
  activeOnly?: boolean;
}

function toRuleLike(rule: {
  ruleId: string;
  ruleType: string;
  conditions: unknown;
  action: unknown;
  requiredDocuments: unknown;
  priority: number;
  approvalType?: {
    code: string;
    name: string;
    stage: string;
    validityDays: number | null;
    authority: { name: string; level: string; jurisdiction: string };
    department: { name: string };
  } | null;
}): RuleLike {
  return {
    ruleId: rule.ruleId,
    ruleType: rule.ruleType,
    conditions: (rule.conditions ?? {}) as Condition,
    action: (rule.action ?? {}) as Record<string, unknown>,
    requiredDocuments: (rule.requiredDocuments as string[] | null) ?? [],
    priority: rule.priority,
    approvalType: rule.approvalType
      ? {
          code: rule.approvalType.code,
          name: rule.approvalType.name,
          stage: rule.approvalType.stage,
          validityDays: rule.approvalType.validityDays,
          authority: {
            name: rule.approvalType.authority.name,
            level: rule.approvalType.authority.level,
            jurisdiction: rule.approvalType.authority.jurisdiction,
          },
          department: { name: rule.approvalType.department.name },
        }
      : null,
  };
}

/** Evaluates the knowledge base against a unit/project context. */
export async function getApplicableApprovals(
  ctx: EvaluationContext
): Promise<EvaluationResult> {
  const rows = await prisma.regulatoryRule.findMany({
    where: { isActive: true },
    include: {
      approvalType: { include: { authority: true, department: true } },
    },
    orderBy: { priority: "asc" },
  });

  return evaluateRules(rows.map(toRuleLike), ctx);
}

export interface RuleListRow {
  id: string;
  ruleId: string;
  ruleType: string;
  jurisdiction: string;
  level: string;
  authorityName: string;
  regulation: string | null;
  verificationStatus: string;
  priority: number;
  isActive: boolean;
  lastVerified: Date | null;
  approval: {
    code: string | null;
    name: string | null;
    stage: string | null;
    department: string | null;
  };
}

/** Master catalogue for the admin rule viewer / filters. */
export async function listRules(filters: RuleListFilters = {}): Promise<{
  items: RuleListRow[];
  total: number;
  byType: Record<string, number>;
}> {
  const where: Record<string, unknown> = {};
  if (filters.ruleType) where.ruleType = filters.ruleType;
  if (filters.authority) where.authorityName = filters.authority;
  if (filters.activeOnly) where.isActive = true;
  if (filters.q) {
    where.OR = [
      { ruleId: { contains: filters.q, mode: "insensitive" } },
      { authorityName: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const items = await prisma.regulatoryRule.findMany({
    where,
    include: { approvalType: { include: { department: true } } },
    orderBy: [{ priority: "asc" }, { ruleId: "asc" }],
    take: 200,
  });

  const rows: RuleListRow[] = items.map((r) => ({
    id: r.id,
    ruleId: r.ruleId,
    ruleType: r.ruleType,
    jurisdiction: r.jurisdiction,
    level: r.level,
    authorityName: r.authorityName,
    regulation: r.regulation,
    verificationStatus: r.verificationStatus,
    priority: r.priority,
    isActive: r.isActive,
    lastVerified: r.lastVerified,
    approval: {
      code: r.approvalType?.code ?? null,
      name: r.approvalType?.name ?? null,
      stage: r.approvalType?.stage ?? null,
      department: r.approvalType?.department.name ?? null,
    },
  }));

  const grouped = await prisma.regulatoryRule.groupBy({
    by: ["ruleType"],
    _count: { _all: true },
  });
  const byType: Record<string, number> = {};
  for (const g of grouped) byType[String(g.ruleType)] = g._count._all;

  return { items: rows, total: rows.length, byType };
}