import { api } from "./client";

// ── Phase 8: incentives — scheme eligibility & claim utilisation ──

export interface EligibilityCheck {
  key: string;
  label: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  windowOpen: boolean;
  active: boolean;
  checks: EligibilityCheck[];
  context: Record<string, unknown>;
  evaluatedAt: string;
}

export interface Claim {
  id: string;
  schemeId: string;
  unitId: string;
  status: string; // SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | DISBURSED | UTILISED
  requestedAmountInr: number;
  approvedAmountInr: number | null;
  notes: string | null;
  decisionNotes: string | null;
  disbursementRef: string | null;
  disbursedAt: string | null;
  utilisationNotes: string | null;
  utilisedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Scheme {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  authority: string;
  department: string | null;
  benefitType: string;
  benefitSummary: string;
  maxAmountInr: number | null;
  requiredDocuments: string[];
  opensOn: string | null;
  closesOn: string | null;
  active: boolean;
}

/** Catalogue row: the scheme plus the (optional) live evaluation + claim state. */
export interface SchemeRow extends Scheme {
  eligibility: EligibilityResult | null;
  claimCount: number | null;
  myClaim: Claim | null;
}

export interface ClaimListItem extends Claim {
  scheme: Pick<Scheme, "id" | "code" | "name" | "category" | "maxAmountInr">;
  unit?: { id: string; name: string; district: string | null; state: string | null };
}

export interface ClaimEvent {
  id: string;
  eventType: string;
  actorId: string;
  actorRole: string;
  comment: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ClaimDetail {
  claim: Claim;
  scheme: Scheme;
  unit: { id: string; name: string; state: string | null; district: string | null };
  events: ClaimEvent[];
  can: { review: boolean; decide: boolean; disburse: boolean; utilise: boolean };
}

export function listSchemes(opts: { unitId?: string; q?: string; category?: string; includeInactive?: boolean } = {}): Promise<{ items: SchemeRow[] }> {
  const params = new URLSearchParams();
  if (opts.unitId) params.set("unitId", opts.unitId);
  if (opts.q) params.set("q", opts.q);
  if (opts.category) params.set("category", opts.category);
  if (opts.includeInactive) params.set("includeInactive", "true");
  const qs = params.toString();
  return api(`/incentives/schemes${qs ? `?${qs}` : ""}`);
}

export function checkScheme(
  schemeId: string,
  unitId: string,
): Promise<{ scheme: Scheme; eligibility: EligibilityResult; myClaim: Claim | null }> {
  return api(`/incentives/schemes/${schemeId}/check`, { method: "POST", body: { unitId } });
}

export function listClaims(opts: { status?: string; unitId?: string } = {}): Promise<{
  items: ClaimListItem[];
  counts: Record<string, number>;
}> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.unitId) params.set("unitId", opts.unitId);
  const qs = params.toString();
  return api(`/incentives/claims${qs ? `?${qs}` : ""}`);
}

export function getClaim(claimId: string): Promise<ClaimDetail> {
  return api(`/incentives/claims/${claimId}`);
}

export function createClaim(input: {
  schemeId: string;
  unitId: string;
  requestedAmountInr: number;
  notes?: string;
}): Promise<{ claim: Claim }> {
  return api("/incentives/claims", { method: "POST", body: input });
}

export function reviewClaim(claimId: string): Promise<{ claim: Claim }> {
  return api(`/incentives/claims/${claimId}/review`, { method: "POST" });
}

export function decideClaim(
  claimId: string,
  input: { approved: boolean; amountInr?: number; notes?: string },
): Promise<{ claim: Claim }> {
  return api(`/incentives/claims/${claimId}/decide`, { method: "POST", body: input });
}

export function disburseClaim(claimId: string, reference: string): Promise<{ claim: Claim }> {
  return api(`/incentives/claims/${claimId}/disburse`, { method: "POST", body: { reference } });
}

export function utiliseClaim(claimId: string, notes: string): Promise<{ claim: Claim }> {
  return api(`/incentives/claims/${claimId}/utilise`, { method: "POST", body: { notes } });
}

/** ₹ formatting consistent across schemes/claims views. */
export function inr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}
