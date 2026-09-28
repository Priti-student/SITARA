import { api } from "./client";

export interface RuleApproval {
  code: string | null;
  name: string | null;
  stage: string | null;
  department: string | null;
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
  approval: RuleApproval;
}

export interface RuleListData {
  items: RuleListRow[];
  total: number;
  byType: Record<string, number>;
}

export interface EvaluatedApproval {
  approvalCode: string;
  approvalName: string;
  authority: string;
  level: string;
  jurisdiction: string;
  department: string;
  stage: string;
  requiredDocuments: string[];
  workflowNotes: string[];
  renewalAlertDays: number | null;
  validityDays: number | null;
  priority: number;
  sourceRuleIds: string[];
}

export interface EvaluationResultData {
  applicableApprovals: EvaluatedApproval[];
  classification: { category: string; sourceRuleId: string } | null;
  workflowHints: string[];
  firedRuleIds: string[];
  evaluatedAt: string;
}

export function listRules(query: { ruleType?: string; q?: string } = {}): Promise<RuleListData> {
  const params = new URLSearchParams();
  if (query.ruleType) params.set("ruleType", query.ruleType);
  if (query.q) params.set("q", query.q);
  const qs = params.toString();
  return api<RuleListData>(`/rules${qs ? `?${qs}` : ""}`);
}

export function listApprovalTypes(): Promise<{
  items: { code: string; name: string; stage: string; description: string | null }[];
}> {
  return api("/rules/approval-types");
}

export function evaluateRules(context: Record<string, unknown>): Promise<EvaluationResultData> {
  return api<EvaluationResultData>("/rules/evaluate", { method: "POST", body: { context } });
}