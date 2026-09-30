import { api } from "./client";

// ── Phase 9: grievances — filing, handling & escalation ──

export interface Grievance {
  id: string;
  referenceNo: string;
  subject: string;
  description: string;
  category: string; // SERVICE_DELAY | PROCESS_ISSUE | CORRUPTION_REPORT | OTHER
  priority: string; // LOW | MEDIUM | HIGH
  status: string; // OPEN | IN_PROGRESS | ESCALATED | RESOLVED | REJECTED
  escalationLevel: number;
  slaDueAt: string;
  unitId: string | null;
  applicationId: string | null;
  createdById: string;
  assignedToId: string | null;
  responseNotes: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  escalatedAt: string | null;
  escalationReason: string | null;
  createdAt: string;
  overdue?: boolean;
  unit?: { id: string; name: string; district: string | null; state: string | null } | null;
  application?: { id: string; applicationNo: string; status: string } | null;
  creator?: { id: string; fullName: string };
  assignee?: { id: string; fullName: string } | null;
}

export interface GrievanceEvent {
  id: string;
  eventType: string;
  actorId: string;
  actorRole: string;
  comment: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface GrievanceDetail {
  grievance: Grievance;
  events: GrievanceEvent[];
  can: { acknowledge: boolean; respond: boolean; resolve: boolean; escalate: boolean };
}

export type GrievanceCounts = Record<string, number>;

export const CATEGORIES = ["SERVICE_DELAY", "PROCESS_ISSUE", "CORRUPTION_REPORT", "OTHER"] as const;

export function listGrievances(params: { status?: string; category?: string; priority?: string } = {}): Promise<{
  items: Grievance[];
  counts: GrievanceCounts;
}> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.category) q.set("category", params.category);
  if (params.priority) q.set("priority", params.priority);
  const qs = q.toString();
  return api(`/grievances${qs ? `?${qs}` : ""}`);
}

export function getGrievance(grievanceId: string): Promise<GrievanceDetail> {
  return api(`/grievances/${grievanceId}`);
}

export function fileGrievance(input: {
  subject: string;
  description: string;
  category: string;
  priority?: string;
  unitId?: string;
}): Promise<{ grievance: Grievance }> {
  return api("/grievances", { method: "POST", body: input });
}

export function acknowledgeGrievance(grievanceId: string): Promise<{ grievance: Grievance }> {
  return api(`/grievances/${grievanceId}/acknowledge`, { method: "POST" });
}

export function respondToGrievance(grievanceId: string, notes: string): Promise<{ grievance: Grievance }> {
  return api(`/grievances/${grievanceId}/respond`, { method: "POST", body: { notes } });
}

export function resolveGrievance(
  grievanceId: string,
  accepted: boolean,
  notes: string,
): Promise<{ grievance: Grievance }> {
  return api(`/grievances/${grievanceId}/resolve`, { method: "POST", body: { accepted, notes } });
}

export function escalateGrievance(grievanceId: string, reason: string): Promise<{ grievance: Grievance }> {
  return api(`/grievances/${grievanceId}/escalate`, { method: "POST", body: { reason } });
}