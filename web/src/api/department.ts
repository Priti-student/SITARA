import { api } from "./client";
import type { RiskAssessment } from "./inspections";

// ── Shared workflow types (used by applicant detail too) ──

export interface WorkflowTrack {
  id: string;
  department: { code: string; name: string };
  status: string;
  currentStepLabel: string | null;
  currentStepOrder: number | null;
  slaDueAt: string | null;
  escalatedAt: string | null;
  completedAt: string | null;
}

export interface TimelineEvent {
  id: string;
  workflowInstanceId: string | null;
  actorRole: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  approvalNo: string;
  status: string;
  issuedAt: string | null;
  validTill: string | null;
}

// ── Officer inbox ──

export interface InboxItem {
  id: string;
  department: { code: string; name: string };
  currentStepLabel: string | null;
  status: string;
  slaDueAt: string | null;
  overdue: boolean;
  dueSoon: boolean;
  escalated: boolean;
  application: {
    id: string;
    applicationNo: string;
    status: string;
    riskCategory: string | null;
    createdAt: string;
    submittedAt: string | null;
    approvalType: { code: string; name: string };
    unit: { name: string; district: string | null };
    _count: { documents: number };
  };
}

export interface DeptInbox {
  items: InboxItem[];
  myDepartment: { code: string; name: string } | null;
  counts: { active: number; queries: number; overdue: number };
}

export interface AppInspection {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  venue: string | null;
  complianceStatus: string | null;
  completedAt: string | null;
  participants: {
    id: string;
    department: { code: string; name: string };
    inspector: { fullName: string } | null;
  }[];
  _count?: { observations: number };
}

export interface DeptApplication {
  id: string;
  applicationNo: string;
  status: string;
  riskCategory: string | null;
  formData: Record<string, unknown>;
  createdAt: string;
  submittedAt: string | null;
  approvalType: {
    code: string;
    name: string;
    stage: string;
    requirements: { id: string; documentType: { id: string; code: string; name: string } }[];
  };
  unit: { id: string; name: string; registrationNo: string | null; district: string | null; state: string | null } | null;
  documents: {
    id: string;
    documentType: { code: string; name: string };
    originalName: string;
    sizeBytes: number;
    status: string;
  }[];
  workflowInstances: WorkflowTrack[];
  events: TimelineEvent[];
  approvals: ApprovalRecord[];
  riskAssessment: RiskAssessment | null;
  inspections: AppInspection[];
}

// ── Calls ──

export function getDeptInbox(status?: string): Promise<DeptInbox> {
  return api<DeptInbox>(`/department/inbox${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}

export function getDeptApplication(id: string): Promise<{ application: DeptApplication }> {
  return api(`/department/applications/${id}`);
}

export function approveStep(
  id: string,
  instanceId: string,
  comment?: string
): Promise<{ status: string }> {
  return api(`/department/applications/${id}/approve`, {
    method: "POST",
    body: { instanceId, comment },
  });
}

export function rejectApplication(id: string, instanceId: string, reason: string): Promise<unknown> {
  return api(`/department/applications/${id}/reject`, {
    method: "POST",
    body: { instanceId, reason },
  });
}

export function raiseQuery(id: string, instanceId: string, question: string): Promise<unknown> {
  return api(`/department/applications/${id}/query`, {
    method: "POST",
    body: { instanceId, question },
  });
}

export function escalateInstance(id: string, instanceId: string, reason: string): Promise<unknown> {
  return api(`/department/applications/${id}/escalate`, {
    method: "POST",
    body: { instanceId, reason },
  });
}

export function runSla(): Promise<{ overdue: number; scanned: number }> {
  return api("/department/sla/run", { method: "POST" });
}
