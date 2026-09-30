import { api } from "./client";

// ── Phase 7: renewals & approval lifecycle ──

export interface DueRenewal {
  id: string;
  approvalNo: string;
  status: string; // ACTIVE | EXPIRED | REVOKED
  state: string; // CURRENT | DUE_SOON | EXPIRED | REVOKED | NO_EXPIRY
  issuedAt: string;
  validTill: string | null;
  daysLeft: number | null;
  renewedAt: string | null;
  renewalCount: number;
  renewalAlertAt: string | null;
  approvalType: { code: string; name: string; validityDays: number | null };
  unit: { id: string; name: string; district: string | null; state: string | null };
  renewalApplication: { id: string; applicationNo: string; status: string } | null;
  hasPendingRenewal: boolean;
  openComplianceCases: number;
}

export interface RenewalReadiness {
  approval: {
    id: string;
    approvalNo: string;
    status: string;
    issuedAt: string;
    validTill: string | null;
    renewedAt: string | null;
    renewalCount: number;
    renewalAlertAt: string | null;
    approvalType: { code: string; name: string; validityDays: number | null };
    unit: { id: string; name: string; district: string | null; state: string | null };
    originalApplicationNo: string;
  };
  daysLeft: number | null;
  state: string;
  openComplianceCases: number;
  pendingRenewal: { id: string; applicationNo: string; status: string } | null;
  blockers: { code: string; message: string }[];
  canRenew: boolean;
}

export function listDueRenewals(days?: number): Promise<{ alertDays: number; items: DueRenewal[] }> {
  return api(`/renewals/due${days ? `?days=${days}` : ""}`);
}

export function getRenewalReadiness(approvalId: string): Promise<{ readiness: RenewalReadiness }> {
  return api(`/renewals/${approvalId}`);
}

export function createRenewal(approvalId: string): Promise<{ application: { id: string; applicationNo: string; status: string } }> {
  return api("/renewals", { method: "POST", body: { approvalId } });
}

export function runRenewalSweep(): Promise<{ expired: number; alerts: number }> {
  return api("/renewals/sweep", { method: "POST" });
}
