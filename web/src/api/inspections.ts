import { api } from "./client";

// ── Phase 6: risk-based scrutiny & joint inspections ──

export interface RiskFactor {
  code: string;
  label: string;
  points: number;
  detail?: string;
}

export interface RiskAssessment {
  id: string;
  applicationId: string;
  score: number;
  category: string; // LOW | MEDIUM | HIGH
  scrutinyLevel: string; // DESK | ENHANCED | PHYSICAL
  requiresInspection: boolean;
  factors: RiskFactor[];
  assessedAt: string;
}

export interface InspectionParticipant {
  id: string;
  observedAt: string | null;
  department: { id: string; code: string; name: string };
  inspector: { id: string; fullName: string; email: string } | null;
}

export interface InspectionSummary {
  id: string;
  title: string;
  status: string; // SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED
  scheduledAt: string;
  venue: string | null;
  riskScoreAtScheduling: number | null;
  findings: string | null;
  complianceStatus: string | null;
  completedAt: string | null;
  application: {
    id: string;
    applicationNo: string;
    status: string;
    riskCategory: string | null;
    approvalType: { code: string; name: string };
    unit: { id: string; name: string; district: string | null; state: string | null };
  };
  participants: InspectionParticipant[];
  _count?: { observations: number };
}

export interface InspectionObservation {
  id: string;
  compliant: boolean;
  notes: string;
  createdAt: string;
  participant: {
    department: { code: string; name: string };
    inspector: { fullName: string } | null;
  };
}

export interface InspectionDetail {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  venue: string | null;
  riskScoreAtScheduling: number | null;
  findings: string | null;
  complianceStatus: string | null;
  completedAt: string | null;
  application: {
    id: string;
    applicationNo: string;
    status: string;
    riskCategory: string | null;
    approvalType: { code: string; name: string };
    unit: { id: string; name: string; district: string | null; state: string | null; address: string | null };
  };
  participants: {
    id: string;
    observedAt: string | null;
    department: { id: string; code: string; name: string };
    inspector: { id: string; fullName: string; email: string } | null;
  }[];
  observations: InspectionObservation[];
  risk: RiskAssessment | null;
  events: {
    id: string;
    eventType: string;
    actorRole: string;
    comment: string | null;
    toStatus: string | null;
    createdAt: string;
  }[];
  myParticipantIds: string[];
  canManage: boolean;
}

export interface InspectorDirectoryItem {
  id: string;
  fullName: string;
  email: string;
  department: { id: string; code: string; name: string } | null;
}

export function listInspections(params: { status?: string; applicationId?: string; mine?: boolean } = {}): Promise<{
  items: InspectionSummary[];
  counts: { scheduled: number; active: number; completed: number; cancelled: number };
}> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.applicationId) q.set("applicationId", params.applicationId);
  if (params.mine) q.set("mine", "true");
  const qs = q.toString();
  return api(`/inspections${qs ? `?${qs}` : ""}`);
}

export function getInspection(id: string): Promise<{ inspection: InspectionDetail }> {
  return api(`/inspections/${id}`);
}

export function getRiskAssessment(applicationId: string): Promise<{ assessment: RiskAssessment }> {
  return api(`/inspections/risk/${applicationId}`);
}

export function createInspection(input: {
  applicationId: string;
  title?: string;
  scheduledAt: string;
  venue?: string;
  departmentCodes?: string[];
}): Promise<{ inspection: InspectionSummary }> {
  return api("/inspections", { method: "POST", body: input });
}

export function listInspectors(): Promise<{ items: InspectorDirectoryItem[] }> {
  return api("/inspections/inspectors");
}

export function assignInspector(
  inspectionId: string,
  participantId: string,
  inspectorId: string
): Promise<{ success: boolean }> {
  return api(`/inspections/${inspectionId}/assign`, { method: "POST", body: { participantId, inspectorId } });
}

export function startInspection(inspectionId: string): Promise<{ status: string }> {
  return api(`/inspections/${inspectionId}/start`, { method: "POST" });
}

export function fileObservation(
  inspectionId: string,
  input: { participantId?: string; compliant: boolean; notes: string }
): Promise<unknown> {
  return api(`/inspections/${inspectionId}/observation`, { method: "POST", body: input });
}

export function completeInspection(
  inspectionId: string,
  input: { findings: string; complianceStatus: string }
): Promise<unknown> {
  return api(`/inspections/${inspectionId}/complete`, { method: "POST", body: input });
}

export function cancelInspection(inspectionId: string, reason: string): Promise<{ success: boolean }> {
  return api(`/inspections/${inspectionId}/cancel`, { method: "POST", body: { reason } });
}
