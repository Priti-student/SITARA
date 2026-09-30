import { api } from "./client";

// ── Phase 7: compliance remediation cases ──

export interface ComplianceCase {
  id: string;
  status: string; // OPEN | REMEDIATED | RESOLVED
  severity: string; // NON_COMPLIANT | DEFICIENT
  findings: string | null;
  remediationDueAt: string | null;
  overdue: boolean;
  remediationNotes: string | null;
  remediatedAt: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  unit: { id: string; name: string; district: string | null; state: string | null };
  application: { id: string; applicationNo: string; status: string } | null;
  inspection: { id: string; title: string; scheduledAt: string | null; completedAt: string | null; complianceStatus: string | null } | null;
}

export interface ComplianceCounts {
  OPEN: number;
  REMEDIATED: number;
  RESOLVED: number;
  total: number;
}

export interface ComplianceCaseDetail extends ComplianceCase {
  events: {
    id: string;
    eventType: string;
    actorRole: string;
    comment: string | null;
    createdAt: string;
  }[];
  canRemediate: boolean;
  canResolve: boolean;
}

export interface UnitComplianceStatus {
  unitId: string;
  status: string; // COMPLIANT | PARTIAL | DEFICIENT | NON_COMPLIANT | REMEDIATED | NO_DATA
  openCases: number;
  totalCases: number;
  cases: {
    id: string;
    status: string;
    severity: string;
    findings: string | null;
    remediationDueAt: string | null;
    createdAt: string;
  }[];
  lastInspection: { id: string; title: string; complianceStatus: string | null; completedAt: string | null } | null;
}

export function listComplianceCases(params: { status?: string; unitId?: string } = {}): Promise<{
  items: ComplianceCase[];
  counts: ComplianceCounts;
}> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.unitId) q.set("unitId", params.unitId);
  const qs = q.toString();
  return api(`/compliance${qs ? `?${qs}` : ""}`);
}

export function getComplianceCase(caseId: string): Promise<{ case: ComplianceCaseDetail }> {
  return api(`/compliance/${caseId}`);
}

export function getUnitComplianceStatus(unitId: string): Promise<UnitComplianceStatus> {
  return api(`/compliance/units/${unitId}`);
}

export function submitRemediation(caseId: string, notes: string): Promise<{ case: ComplianceCase }> {
  return api(`/compliance/${caseId}/remediate`, { method: "POST", body: { notes } });
}

export function resolveComplianceCase(caseId: string, accepted: boolean, notes?: string): Promise<{ case: ComplianceCase }> {
  return api(`/compliance/${caseId}/resolve`, { method: "POST", body: { accepted, notes } });
}
