// ───────────────────────────────────────────────────────────────
// Incentives service (Phase 8) — scheme catalogue, eligibility
// matching (reuses the Phase-2 condition engine) and the claim
// lifecycle: SUBMITTED → UNDER_REVIEW → APPROVED → DISBURSED →
// UTILISED (or REJECTED).
// ───────────────────────────────────────────────────────────────
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { type AuthUser } from "../middleware/auth.js";
import { createNotification } from "../services/notifications.service.js";
import { evaluateCondition } from "../rules/conditions.js";
import type { EvaluationContext } from "../rules/types.js";
import { Prisma } from "@prisma/client";

const OFFICER_ROLES = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"];
/** Money movement sits with state/central administration. */
const FINANCE_ROLES = ["STATE_ADMIN", "SUPER_ADMIN"];
/** A fresh claim is blocked while one of these is still live/used. */
const BLOCKING_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "DISBURSED", "UTILISED"];
const NUMERIC_SUFFIXES = ["_lte", "_gte", "_lt", "_gt"] as const;

export interface EligibilityCheck {
  key: string;
  label: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  /** Scheme application window open (ignores the `active` flag). */
  windowOpen: boolean;
  active: boolean;
  checks: EligibilityCheck[];
  /** Context snapshot the conditions were evaluated against. */
  context: Record<string, unknown>;
  evaluatedAt: string;
}

function isOfficer(user: AuthUser): boolean {
  return user.roles.some((r) => OFFICER_ROLES.includes(r));
}

function isFinance(user: AuthUser): boolean {
  return user.roles.some((r) => FINANCE_ROLES.includes(r));
}

async function memberUnitIds(user: AuthUser): Promise<string[]> {
  const rows = await prisma.unitMember.findMany({ where: { userId: user.id }, select: { unitId: true } });
  return rows.map((r) => r.unitId);
}

/** Officers are unscoped; applicants must belong to the unit (else 404). */
async function assertUnitAccess(user: AuthUser, unitId: string): Promise<void> {
  if (isOfficer(user)) return;
  const member = await prisma.unitMember.findFirst({ where: { unitId, userId: user.id } });
  if (!member) {
    throw new AppError({ message: "Unit not found", status: 404, code: "NOT_FOUND" });
  }
}

async function unitMemberIds(unitId: string): Promise<string[]> {
  const rows = await prisma.unitMember.findMany({ where: { unitId }, select: { userId: true } });
  return [...new Set(rows.map((r) => r.userId))];
}

/** Notifies every active state/platform admin (the review queue). */
async function notifyOfficers(input: { type: string; title: string; message: string; data?: unknown }): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["STATE_ADMIN", "SUPER_ADMIN"] } } } } },
    select: { id: true },
  });
  for (const a of admins) {
    await createNotification({ userId: a.id, ...input });
  }
}

async function notifyUnitMembers(
  unitId: string,
  input: { type: string; title: string; message: string; data?: unknown },
): Promise<void> {
  for (const userId of await unitMemberIds(unitId)) {
    await createNotification({ userId, ...input });
  }
}

/** Context lookup tolerant of snake_case / camelCase key conventions. */
function lookupCtx(ctx: EvaluationContext, key: string): unknown {
  if (key in ctx) return ctx[key];
  const camel = key.replace(/_([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
  if (camel in ctx) return ctx[camel];
  const snake = key.replace(/[A-Z]/g, (c: string) => `_${c.toLowerCase()}`);
  if (snake in ctx) return ctx[snake];
  return undefined;
}

/** The observed value for a condition key (null when not applicable). */
function actualFor(ctx: EvaluationContext, key: string): unknown {
  if (key === "anyOf" || key === "allOf") return null;
  const suffix = NUMERIC_SUFFIXES.find((s) => key.endsWith(s));
  const base = suffix ? key.slice(0, -suffix.length) : key;
  const value = lookupCtx(ctx, base);
  return value === undefined ? null : value;
}

/** Human-readable label, e.g. "capital investment ≤ 50000000". */
function humanise(key: string, expected: unknown): string {
  if (key === "anyOf") return `any of ${Array.isArray(expected) ? expected.length : 0} rule groups`;
  if (key === "allOf") return `all of ${Array.isArray(expected) ? expected.length : 0} rule groups`;
  const suffix = NUMERIC_SUFFIXES.find((s) => key.endsWith(s));
  const base = suffix ? key.slice(0, -suffix.length) : key;
  const words = base.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  const op = suffix ? ({ _lte: "≤", _gte: "≥", _lt: "<", _gt: ">" } as Record<string, string>)[suffix] : null;
  if (op) return `${words} ${op} ${expected}`;
  if (Array.isArray(expected)) return `${words} in [${expected.join(", ")}]`;
  return `${words} = ${String(expected)}`;
}

/**
 * Builds the evaluation context for a unit: profile fields plus derived
 * compliance facts (active approvals, open remediation cases).
 */
async function buildContext(unitId: string): Promise<EvaluationContext> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) {
    throw new AppError({ message: "Unit not found", status: 404, code: "NOT_FOUND" });
  }
  const [activeApprovals, openCases] = await Promise.all([
    prisma.approval.count({ where: { unitId, status: "ACTIVE" } }),
    prisma.complianceCase.count({ where: { unitId, status: { in: ["OPEN", "REMEDIATED"] } } }),
  ]);
  return {
    state: unit.state ?? undefined,
    district: unit.district ?? undefined,
    sector: unit.sector ?? undefined,
    industryType: unit.industryType ?? undefined,
    establishmentType: unit.establishmentType ?? undefined,
    employeeCount: unit.employeeCount ?? undefined,
    capitalInvestment: unit.capitalInvestment ?? undefined,
    isVerified: unit.isVerified,
    hasActiveApproval: activeApprovals > 0,
    openComplianceCases: openCases,
  };
}

/**
 * Evaluates a scheme's eligibility condition tree against a unit.
 * Every top-level entry becomes one human-readable check so the UI can
 * show exactly why a unit does (not) qualify.
 */
export async function evaluateScheme(
  scheme: { id: string; eligibility: unknown; opensOn: Date | null; closesOn: Date | null; active: boolean },
  unitId: string,
): Promise<EligibilityResult> {
  const ctx = await buildContext(unitId);
  const conditions = (typeof scheme.eligibility === "object" && scheme.eligibility !== null
    ? scheme.eligibility
    : {}) as Record<string, unknown>;

  const checks: EligibilityCheck[] = Object.entries(conditions).map(([key, expected]) => ({
    key,
    label: humanise(key, expected),
    expected,
    actual: actualFor(ctx, key),
    passed: evaluateCondition(key, expected, ctx),
  }));

  const now = new Date();
  const windowOpen =
    (!scheme.opensOn || scheme.opensOn.getTime() <= now.getTime()) &&
    (!scheme.closesOn || scheme.closesOn.getTime() >= now.getTime());

  return {
    eligible: checks.every((c) => c.passed),
    windowOpen,
    active: scheme.active,
    checks,
    context: ctx as Record<string, unknown>,
    evaluatedAt: now.toISOString(),
  };
}

type SchemeRow = NonNullable<Awaited<ReturnType<typeof prisma.incentiveScheme.findUnique>>>;

/** Serialises a scheme for API responses (conditions kept as-is). */
function schemeShape(s: SchemeRow) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description,
    category: s.category,
    authority: s.authority,
    department: s.department,
    benefitType: s.benefitType,
    benefitSummary: s.benefitSummary,
    maxAmountInr: s.maxAmountInr,
    eligibility: s.eligibility,
    requiredDocuments: s.requiredDocuments,
    opensOn: s.opensOn,
    closesOn: s.closesOn,
    active: s.active,
    claimCount: undefined as number | undefined,
  };
}

type ClaimRow = NonNullable<Awaited<ReturnType<typeof prisma.incentiveClaim.findUnique>>>;

function claimShape(c: ClaimRow) {
  return {
    id: c.id,
    schemeId: c.schemeId,
    unitId: c.unitId,
    status: c.status,
    requestedAmountInr: c.requestedAmountInr,
    approvedAmountInr: c.approvedAmountInr,
    notes: c.notes,
    decisionNotes: c.decisionNotes,
    disbursementRef: c.disbursementRef,
    disbursedAt: c.disbursedAt,
    utilisationNotes: c.utilisationNotes,
    utilisedAt: c.utilisedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export interface ListSchemesOptions {
  q?: string;
  category?: string;
  unitId?: string;
  includeInactive?: boolean;
}

/**
 * Scheme catalogue. With a `unitId` the caller may access, every scheme
 * is enriched with a live eligibility evaluation + their claim state.
 */
export async function listSchemes(user: AuthUser, opts: ListSchemesOptions = {}) {
  const officer = isOfficer(user);
  const schemes = await prisma.incentiveScheme.findMany({
    where: {
      ...(officer && opts.includeInactive ? {} : { active: true }),
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.q
        ? {
            OR: [
              { name: { contains: opts.q, mode: "insensitive" as const } },
              { code: { contains: opts.q, mode: "insensitive" as const } },
              { description: { contains: opts.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 100,
  });

  const unitId = opts.unitId ?? null;
  if (unitId) await assertUnitAccess(user, unitId);

  const claims = unitId
    ? await prisma.incentiveClaim.findMany({ where: { unitId }, orderBy: { createdAt: "desc" } })
    : [];
  const claimCounts = unitId
    ? await prisma.incentiveClaim.groupBy({ by: ["schemeId"], where: { unitId }, _count: { _all: true } })
    : [];

  const items = await Promise.all(
    schemes.map(async (s) => {
      const shape = schemeShape(s);
      const count = claimCounts.find((c) => c.schemeId === s.id)?._count._all;
      return {
        ...shape,
        claimCount: count,
        myClaim: claims.find((c) => c.schemeId === s.id) ? claimShape(claims.find((c) => c.schemeId === s.id)!) : null,
        eligibility: unitId ? await evaluateScheme(s, unitId) : null,
      };
    }),
  );
  return { items };
}

/** Dry-run eligibility check for one scheme + unit (the "Do I qualify?" panel). */
export async function checkEligibility(user: AuthUser, schemeId: string, unitId: string) {
  const scheme = await prisma.incentiveScheme.findUnique({ where: { id: schemeId } });
  if (!scheme || (!scheme.active && !isOfficer(user))) {
    throw new AppError({ message: "Incentive scheme not found", status: 404, code: "NOT_FOUND" });
  }
  await assertUnitAccess(user, unitId);
  const eligibility = await evaluateScheme(scheme, unitId);
  const myClaim = await prisma.incentiveClaim.findFirst({
    where: { schemeId, unitId },
    orderBy: { createdAt: "desc" },
  });
  return { scheme: schemeShape(scheme), eligibility, myClaim: myClaim ? claimShape(myClaim) : null };
}

/** Appends one row to the claim's audit timeline. */
async function recordClaimEvent(input: {
  claimId: string;
  actorId?: string;
  actorRole?: string;
  eventType: string;
  comment?: string;
  metadata?: unknown;
}) {
  return prisma.incentiveClaimEvent.create({
    data: {
      claimId: input.claimId,
      actorId: input.actorId ?? "system",
      actorRole: input.actorRole ?? "SYSTEM",
      eventType: input.eventType,
      comment: input.comment,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata as Prisma.InputJsonValue }),
    },
  });
}

/**
 * Files a unit's claim against a scheme. Eligibility is re-evaluated
 * server-side at filing time — ineligible units are refused with the
 * exact failed checks.
 */
export async function createClaim(
  user: AuthUser,
  input: { schemeId: string; unitId: string; requestedAmountInr: number; notes?: string },
) {
  const scheme = await prisma.incentiveScheme.findUnique({ where: { id: input.schemeId } });
  if (!scheme) {
    throw new AppError({ message: "Incentive scheme not found", status: 404, code: "NOT_FOUND" });
  }
  await assertUnitAccess(user, input.unitId);
  if (!scheme.active) {
    throw new AppError({ message: "This scheme is not accepting claims", status: 409, code: "SCHEME_INACTIVE" });
  }

  const eligibility = await evaluateScheme(scheme, input.unitId);
  if (!eligibility.windowOpen) {
    throw new AppError({ message: "The scheme's application window is closed", status: 409, code: "WINDOW_CLOSED" });
  }
  if (!eligibility.eligible) {
    throw new AppError({
      message: "The unit does not meet this scheme's eligibility criteria",
      status: 422,
      code: "CLAIM_INELIGIBLE",
      details: { checks: eligibility.checks, context: eligibility.context },
    });
  }
  if (scheme.maxAmountInr !== null && input.requestedAmountInr > scheme.maxAmountInr) {
    throw new AppError({
      message: `Requested amount exceeds the scheme ceiling of ₹${scheme.maxAmountInr.toLocaleString("en-IN")}`,
      status: 422,
      code: "AMOUNT_EXCEEDS_CEILING",
      details: { maxAmountInr: scheme.maxAmountInr },
    });
  }

  const existing = await prisma.incentiveClaim.findFirst({
    where: { schemeId: scheme.id, unitId: input.unitId },
    orderBy: { createdAt: "desc" },
  });
  if (existing && BLOCKING_STATUSES.includes(existing.status)) {
    throw new AppError({
      message:
        existing.status === "UTILISED"
          ? "This scheme has already been availed by the unit"
          : `A claim against this scheme is already ${existing.status}`,
      status: 409,
      code: existing.status === "UTILISED" ? "CLAIM_ALREADY_AVAILED" : "CLAIM_IN_PROGRESS",
      details: { claimId: existing.id, status: existing.status },
    });
  }

  const created = await prisma.incentiveClaim.create({
    data: {
      schemeId: scheme.id,
      unitId: input.unitId,
      createdById: user.id,
      status: "SUBMITTED",
      requestedAmountInr: input.requestedAmountInr,
      eligibility: eligibility as unknown as Prisma.InputJsonValue,
      notes: input.notes ?? null,
    },
  });
  await recordClaimEvent({
    claimId: created.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "CLAIM_SUBMITTED",
    comment: `Claim for ${scheme.name} (₹${input.requestedAmountInr.toLocaleString("en-IN")} requested)`,
    metadata: { schemeId: scheme.id, schemeCode: scheme.code },
  });
  await notifyOfficers({
    type: "INCENTIVE",
    title: "New incentive claim",
    message: `${scheme.name}: a unit filed a claim of ₹${input.requestedAmountInr.toLocaleString("en-IN")} — eligibility verified.`,
    data: { claimId: created.id, schemeId: scheme.id },
  });
  return created;
}

/**
 * Claims with status counts. Applicants only see their own units;
 * officers see the full review queue.
 */
export async function listClaims(
  user: AuthUser,
  filters: { status?: string; unitId?: string; schemeId?: string } = {},
) {
  const officer = isOfficer(user);
  const scope = await memberUnitIds(user);
  const where: Prisma.IncentiveClaimWhereInput = {
    ...(officer ? {} : { unitId: { in: scope } }),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.unitId ? { unitId: filters.unitId } : {}),
    ...(filters.schemeId ? { schemeId: filters.schemeId } : {}),
  };

  const [items, grouped] = await Promise.all([
    prisma.incentiveClaim.findMany({
      where,
      include: {
        scheme: { select: { id: true, code: true, name: true, category: true, benefitType: true, maxAmountInr: true } },
        unit: { select: { id: true, name: true, district: true, state: true } },
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.incentiveClaim.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;
  return { items, counts };
}

/** 404 when the claim is unknown or the applicant can't see the unit. */
function claimNotFound(): AppError {
  return new AppError({ message: "Incentive claim not found", status: 404, code: "NOT_FOUND" });
}

async function loadClaim(user: AuthUser, claimId: string) {
  const claim = await prisma.incentiveClaim.findUnique({
    where: { id: claimId },
    include: {
      scheme: true,
      unit: { select: { id: true, name: true, district: true, state: true, isVerified: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!claim) throw claimNotFound();
  if (!isOfficer(user)) {
    const member = await prisma.unitMember.findFirst({ where: { unitId: claim.unitId, userId: user.id } });
    if (!member) throw claimNotFound();
  }
  return claim;
}

/** Claim detail: snapshot, timeline and which actions the caller may take. */
export async function getClaim(user: AuthUser, claimId: string) {
  const claim = await loadClaim(user, claimId);
  const officer = isOfficer(user);
  const finance = isFinance(user);
  return {
    claim: { ...claimShape(claim), eligibility: claim.eligibility, notes: claim.notes },
    scheme: schemeShape(claim.scheme),
    unit: claim.unit,
    events: claim.events,
    can: {
      review: officer && claim.status === "SUBMITTED",
      decide: officer && claim.status === "UNDER_REVIEW",
      disburse: finance && claim.status === "APPROVED",
      utilise: !officer && claim.status === "DISBURSED",
    },
  };
}

function badState(expected: string, actual: string): AppError {
  return new AppError({
    message: `Claim is ${actual} — this action requires status ${expected}`,
    status: 409,
    code: "BAD_STATE",
  });
}

/** Officer picks a SUBMITTED claim up for review. */
export async function startReview(user: AuthUser, claimId: string) {
  if (!isOfficer(user)) {
    throw new AppError({ message: "Only officers can review claims", status: 403, code: "FORBIDDEN" });
  }
  const claim = await loadClaim(user, claimId);
  if (claim.status !== "SUBMITTED") throw badState("SUBMITTED", claim.status);

  const updated = await prisma.incentiveClaim.update({
    where: { id: claim.id },
    data: { status: "UNDER_REVIEW" },
  });
  await recordClaimEvent({
    claimId: claim.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "CLAIM_REVIEW_STARTED",
    comment: "Review started by officer",
    metadata: { from: "SUBMITTED", to: "UNDER_REVIEW" },
  });
  await notifyUnitMembers(claim.unitId, {
    type: "INCENTIVE",
    title: "Claim under review",
    message: `Your claim for ${claim.scheme.name} is now under review.`,
    data: { claimId: claim.id, schemeId: claim.schemeId },
  });
  return updated;
}

/**
 * Officer approves or rejects a claim under review. Approval sets the
 * sanctioned amount (defaults to the requested amount, capped by it).
 */
export async function decideClaim(
  user: AuthUser,
  claimId: string,
  input: { approved: boolean; amountInr?: number; notes?: string },
) {
  if (!isOfficer(user)) {
    throw new AppError({ message: "Only officers can decide claims", status: 403, code: "FORBIDDEN" });
  }
  const claim = await loadClaim(user, claimId);
  if (claim.status !== "UNDER_REVIEW") throw badState("UNDER_REVIEW", claim.status);

  const approvedAmount = input.approved ? (input.amountInr ?? claim.requestedAmountInr) : null;
  if (approvedAmount !== null && (approvedAmount <= 0 || approvedAmount > claim.requestedAmountInr)) {
    throw new AppError({
      message: "Sanctioned amount must be positive and no more than the requested amount",
      status: 422,
      code: "INVALID_AMOUNT",
      details: { requestedAmountInr: claim.requestedAmountInr },
    });
  }

  const now = new Date();
  const status = input.approved ? "APPROVED" : "REJECTED";
  const updated = await prisma.incentiveClaim.update({
    where: { id: claim.id },
    data: {
      status,
      approvedAmountInr: approvedAmount,
      decisionNotes: input.notes ?? null,
      decidedById: user.id,
      decidedAt: now,
    },
  });
  await recordClaimEvent({
    claimId: claim.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: input.approved ? "CLAIM_APPROVED" : "CLAIM_REJECTED",
    comment:
      input.notes?.slice(0, 500) ??
      (input.approved ? `Sanctioned ₹${(approvedAmount ?? 0).toLocaleString("en-IN")}` : "Claim rejected"),
    metadata: { from: "UNDER_REVIEW", to: status, amountInr: approvedAmount },
  });
  await notifyUnitMembers(claim.unitId, {
    type: "INCENTIVE",
    title: input.approved ? "Incentive claim approved" : "Incentive claim rejected",
    message: input.approved
      ? `${claim.scheme.name}: ₹${(approvedAmount ?? 0).toLocaleString("en-IN")} sanctioned — awaiting disbursement.`
      : `${claim.scheme.name}: your claim was rejected.${input.notes ? ` ${input.notes}` : ""}`,
    data: { claimId: claim.id, schemeId: claim.schemeId },
  });
  return updated;
}

/** Finance (state/platform admin) marks an approved claim as disbursed. */
export async function disburseClaim(user: AuthUser, claimId: string, input: { reference: string }) {
  if (!isFinance(user)) {
    throw new AppError({ message: "Only state/platform admins can disburse", status: 403, code: "FORBIDDEN" });
  }
  const claim = await loadClaim(user, claimId);
  if (claim.status !== "APPROVED") throw badState("APPROVED", claim.status);

  const now = new Date();
  const updated = await prisma.incentiveClaim.update({
    where: { id: claim.id },
    data: { status: "DISBURSED", disbursementRef: input.reference, disbursedAt: now },
  });
  await recordClaimEvent({
    claimId: claim.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "CLAIM_DISBURSED",
    comment: `Disbursed ₹${(claim.approvedAmountInr ?? 0).toLocaleString("en-IN")} (ref ${input.reference})`,
    metadata: { from: "APPROVED", to: "DISBURSED", reference: input.reference },
  });
  await notifyUnitMembers(claim.unitId, {
    type: "INCENTIVE",
    title: "Incentive disbursed",
    message: `${claim.scheme.name}: ₹${(claim.approvedAmountInr ?? 0).toLocaleString("en-IN")} disbursed (ref ${input.reference}).`,
    data: { claimId: claim.id, schemeId: claim.schemeId },
  });
  return updated;
}

/** Unit confirms how the disbursed money was utilised — closes the loop. */
export async function recordUtilisation(user: AuthUser, claimId: string, input: { notes: string }) {
  const claim = await loadClaim(user, claimId);
  if (isOfficer(user)) {
    throw new AppError({ message: "Only the unit can record utilisation", status: 403, code: "FORBIDDEN" });
  }
  if (claim.status !== "DISBURSED") throw badState("DISBURSED", claim.status);

  const now = new Date();
  const updated = await prisma.incentiveClaim.update({
    where: { id: claim.id },
    data: { status: "UTILISED", utilisationNotes: input.notes, utilisedAt: now },
  });
  await recordClaimEvent({
    claimId: claim.id,
    actorId: user.id,
    actorRole: user.roles.join(","),
    eventType: "CLAIM_UTILISED",
    comment: input.notes.slice(0, 500),
    metadata: { from: "DISBURSED", to: "UTILISED" },
  });
  await notifyOfficers({
    type: "INCENTIVE",
    title: "Utilisation recorded",
    message: `${claim.scheme.name}: the unit recorded utilisation of its disbursed incentive.`,
    data: { claimId: claim.id, schemeId: claim.schemeId },
  });
  return updated;
}
