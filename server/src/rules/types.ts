// ───────────────────────────────────────────────────────────────
// Regulatory Knowledge Engine — shared types (Phase 2)
// ───────────────────────────────────────────────────────────────

/// A rule condition tree. Simple keys are AND-ed; `anyOf`/`allOf` nest.
export type Condition = Record<string, unknown>;

/// Inputs describing the unit + project (what the discovery wizard collects).
export interface EvaluationContext {
  state?: string;
  district?: string;
  sector?: string;
  industryType?: string | string[];
  establishmentType?: string;
  employeeCount?: number;
  capitalInvestment?: number;
  stage?: string;
  activities?: string[];
  // plus arbitrary boolean/number flag fields, e.g. pollution_relevant_activity
  [key: string]: unknown;
}

/// Minimal shape of a rule the evaluator understands (DB row or fixture).
export interface RuleLike {
  ruleId: string;
  ruleType: string;
  conditions: Condition;
  action: Record<string, unknown>;
  requiredDocuments: string[];
  priority: number;
  approvalType?: {
    code: string;
    name: string;
    stage: string;
    validityDays?: number | null;
    authority: { name: string; level: string; jurisdiction: string };
    department: { name: string };
  } | null;
}

/// One approval the applicant must obtain, enriched for the checklist UI.
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

export interface EvaluationResult {
  applicableApprovals: EvaluatedApproval[];
  classification: { category: string; sourceRuleId: string } | null;
  workflowHints: string[];
  firedRuleIds: string[];
  evaluatedAt: string;
}