import { api } from "./client";

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

export interface ChecklistSummary {
  id: string;
  name: string;
  status: string;
  riskCategory: string | null;
  createdAt: string;
  unit: { id: string; name: string } | null;
  _count: { items: number };
}

export interface ChecklistItemDetail {
  id: string;
  status: string;
  position: number;
  requiredDocuments: string[];
  approvalType: {
    code: string;
    name: string;
    stage: string;
    authority: { name: string; level: string; jurisdiction: string };
    department: { name: string };
  };
  documents: { code: string; name: string }[];
}

export interface ChecklistDetail {
  id: string;
  name: string;
  status: string;
  riskCategory: string | null;
  context: Record<string, unknown>;
  result: EvaluationResultData;
  createdAt: string;
  unit: { id: string; name: string; district: string | null; state: string | null } | null;
  items: ChecklistItemDetail[];
}

export function previewChecklist(context: Record<string, unknown>): Promise<EvaluationResultData> {
  return api<EvaluationResultData>("/checklists/preview", { method: "POST", body: { context } });
}

export function createChecklist(input: {
  name?: string;
  unitId?: string;
  context: Record<string, unknown>;
}): Promise<{ checklist: { id: string; name: string; items: { id: string }[] } }> {
  return api("/checklists", { method: "POST", body: input });
}

export function listChecklists(): Promise<{ items: ChecklistSummary[] }> {
  return api("/checklists");
}

export function getChecklist(id: string): Promise<{ checklist: ChecklistDetail }> {
  return api(`/checklists/${id}`);
}

export function updateItemStatus(
  checklistId: string,
  itemId: string,
  status: string
): Promise<{ success: boolean }> {
  return api(`/checklists/${checklistId}/items/${itemId}`, {
    method: "PATCH",
    body: { status },
  });
}