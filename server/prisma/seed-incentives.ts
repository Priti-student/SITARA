// ───────────────────────────────────────────────────────────────
// Incentive schemes seed (Phase 8) — catalogue of government
// incentives with condition-tree eligibility rules.
// Idempotent — safe to re-run on every `npm run db:seed`.
// ───────────────────────────────────────────────────────────────
import { prisma } from "../src/utils/prisma.js";
import type { Prisma } from "@prisma/client";

interface SeedScheme {
  code: string;
  name: string;
  description: string;
  category: string;
  authority: string;
  department: string;
  benefitType: string;
  benefitSummary: string;
  maxAmountInr: number | null;
  eligibility: Record<string, unknown>;
  requiredDocuments: string[];
  windowDays?: number; // closesOn = now + windowDays (null/undefined = always open)
}

const SCHEMES: SeedScheme[] = [
  {
    code: "MSME_CAPITAL_SUBSIDY_001",
    name: "MSME Capital Investment Subsidy",
    description: "Reimburses a share of the plant & machinery cost for micro, small and medium enterprises setting up or expanding manufacturing capacity in the state.",
    category: "SUBSIDY",
    authority: "Department of Industries & SME, Maharashtra",
    department: "INDUSTRY",
    benefitType: "REIMBURSEMENT",
    benefitSummary: "25% of plant & machinery cost, up to ₹50 lakh",
    maxAmountInr: 5_000_000,
    eligibility: { capitalInvestment_lte: 50_000_000, employeeCount_lte: 500 },
    requiredDocuments: ["udyam_certificate", "project_report", "bank_statement"],
  },
  {
    code: "INTEREST_SUBVENTION_001",
    name: "Interest Subvention on Term Loans",
    description: "Interest subvention on fresh term loans taken for modernisation, provided the unit holds at least one active statutory approval.",
    category: "INTEREST_SUBVENTION",
    authority: "Ministry of MSME, Government of India",
    department: "INDUSTRY",
    benefitType: "DIRECT_TRANSFER",
    benefitSummary: "5% interest subvention per annum, up to ₹20 lakh",
    maxAmountInr: 2_000_000,
    eligibility: { capitalInvestment_gte: 1_000_000, employeeCount_gte: 10, hasActiveApproval: true },
    requiredDocuments: ["term_loan_sanction_letter", "udyam_certificate"],
  },
  {
    code: "GREEN_COMPLIANCE_BONUS_001",
    name: "Green Compliance Bonus",
    description: "One-time bonus for verified units that run with an active consent/licence and zero open compliance cases — rewards a clean inspection record.",
    category: "GREEN_BONUS",
    authority: "Maharashtra Pollution Control Board",
    department: "ENV",
    benefitType: "DIRECT_TRANSFER",
    benefitSummary: "₹5 lakh for a clean compliance record",
    maxAmountInr: 500_000,
    eligibility: { openComplianceCases: 0, hasActiveApproval: true, isVerified: true },
    requiredDocuments: ["consent_copy", "energy_audit_report"],
  },
  {
    code: "SKILL_DEVELOPMENT_GRANT_001",
    name: "Employment & Skill Development Grant",
    description: "Per-employee reimbursement towards certified skilling programmes for units employing a meaningful workforce.",
    category: "GRANT",
    authority: "Labour & Employment Department",
    department: "LABOUR",
    benefitType: "REIMBURSEMENT",
    benefitSummary: "₹1,000 per employee per year, up to ₹10 lakh",
    maxAmountInr: 1_000_000,
    eligibility: { employeeCount_gte: 50 },
    requiredDocuments: ["training_attendance_records", "udyam_certificate"],
    windowDays: 365,
  },
];

export async function seedIncentives(): Promise<void> {
  for (const s of SCHEMES) {
    const data = {
      name: s.name,
      description: s.description,
      category: s.category,
      authority: s.authority,
      department: s.department,
      benefitType: s.benefitType,
      benefitSummary: s.benefitSummary,
      maxAmountInr: s.maxAmountInr,
      eligibility: s.eligibility as unknown as Prisma.InputJsonValue,
      requiredDocuments: s.requiredDocuments as unknown as Prisma.InputJsonValue,
      opensOn: null,
      closesOn: s.windowDays ? new Date(Date.now() + s.windowDays * 86400000) : null,
      active: true,
    };
    await prisma.incentiveScheme.upsert({
      where: { code: s.code },
      update: data,
      create: { code: s.code, ...data },
    });
  }
  console.log(`✓ Seeded ${SCHEMES.length} incentive schemes`);
}
