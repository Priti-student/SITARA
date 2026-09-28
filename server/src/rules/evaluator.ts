// ───────────────────────────────────────────────────────────────
// Rule evaluator — pure, deterministic, no I/O.
// Turns a list of rule-likes + a unit/profile context into an
// EvaluationResult (applicable approvals, risk, workflow hints).
// ───────────────────────────────────────────────────────────────
import { evaluateConditions } from "./conditions.js";
import type {
  EvaluatedApproval,
  EvaluationContext,
  EvaluationResult,
  RuleLike,
} from "./types.js";

/// Human-readable labels for workflow action flags.
const NOTE_LABELS: Record<string, string> = {
  online_submission: "Online submission available",
  status_tracking: "Live status tracking",
  final_inspection_required: "Final inspection required",
  final_noc_required: "Final NOC required",
  approval_required: "Approval required",
  registration_required: "Registration required",
};

function copyApproval(at: NonNullable<RuleLike["approvalType"]>): EvaluatedApproval {
  return {
    approvalCode: at.code,
    approvalName: at.name,
    authority: at.authority.name,
    level: at.authority.level,
    jurisdiction: at.authority.jurisdiction,
    department: at.department.name,
    stage: at.stage,
    requiredDocuments: [],
    workflowNotes: [],
    renewalAlertDays: null,
    validityDays: at.validityDays ?? null,
    priority: 0,
    sourceRuleIds: [],
  };
}

function notesFor(action: Record<string, unknown>): string[] {
  const notes: string[] = [];
  for (const [key, value] of Object.entries(action)) {
    if (value === true && NOTE_LABELS[key]) notes.push(NOTE_LABELS[key]);
  }
  return notes;
}

export function evaluateRules(
  rules: RuleLike[],
  ctx: EvaluationContext
): EvaluationResult {
  const firedRuleIds: string[] = [];
  const workflowHints = new Set<string>();
  let classification: { category: string; sourceRuleId: string } | null = null;
  const approvals = new Map<string, EvaluatedApproval>();

  for (const rule of rules) {
    if (!evaluateConditions(rule.conditions ?? {}, ctx)) continue;
    firedRuleIds.push(rule.ruleId);

    // Classification rules drive risk categories (RED / AMBER / GREEN…)
    if (rule.ruleType === "classification") {
      const category = rule.action.pollution_category ?? rule.action.category ?? rule.action.risk_category;
      if (category && !classification) {
        classification = { category: String(category), sourceRuleId: rule.ruleId };
      }
      continue;
    }

    // Workflow rules either create (gated approvals) or annotate an approval
    if (rule.ruleType === "workflow" || rule.ruleType === "applicability" || rule.ruleType === "document" || rule.ruleType === "renewal") {
      const notes = notesFor(rule.action);
      for (const note of notes) workflowHints.add(note);

      if (rule.approvalType) {
        const at = rule.approvalType;
        let entry = approvals.get(at.code);
        if (!entry) {
          entry = copyApproval(at);
          approvals.set(at.code, entry);
        }
        entry.sourceRuleIds.push(rule.ruleId);
        if (rule.priority > 0) entry.priority = Math.max(entry.priority, rule.priority);

        // Merge required documents
        for (const doc of rule.requiredDocuments ?? []) {
          if (!entry.requiredDocuments.includes(doc)) entry.requiredDocuments.push(doc);
        }

        // Renewal alerts from rule action
        const alert = rule.action.alert_before_expiry_days;
        if (typeof alert === "number" && alert > 0) entry.renewalAlertDays = alert;

        // Workflow notes onto the approval (e.g. PARIVESH online submission)
        if (rule.ruleType === "workflow") {
          for (const note of notes) entry.workflowNotes.push(note);
        }
      }
      continue;
    }

    // regulatory_source and other informational rules: just record as fired
  }

  const applicableApprovals = [...approvals.values()].sort(
    (a, b) =>
      (a.priority === b.priority ? 0 : a.priority - b.priority) ||
      a.stage.localeCompare(b.stage) ||
      a.approvalName.localeCompare(b.approvalName)
  );

  return {
    applicableApprovals,
    classification,
    workflowHints: [...workflowHints],
    firedRuleIds,
    evaluatedAt: new Date().toISOString(),
  };
}