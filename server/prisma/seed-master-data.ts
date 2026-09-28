// ───────────────────────────────────────────────────────────────
// Master data + regulatory knowledge seed (Phase 2).
// Sources: regulatory_rules.json at the repository root.
// Idempotent — safe to re-run on every `npm run db:seed`.
// ───────────────────────────────────────────────────────────────
import rulesFile from "../../regulatory_rules.json" with { type: "json" };
import { prisma } from "../src/utils/prisma.js";

const DEPARTMENTS: { code: string; name: string; description: string }[] = [
  { code: "ENV", name: "Environment & Pollution Control", description: "Environmental clearances and consents (MoEFCC / MPCB)" },
  { code: "FIRE", name: "Fire & Emergency Services", description: "Fire NOC, life-safety and building approvals" },
  { code: "LABOUR", name: "Labour & Employment", description: "Employer registrations, ESI, labour compliance" },
];

const AUTHORITIES: { name: string; jurisdiction: string; level: string; website: string }[] = [
  { name: "Ministry of Environment, Forest and Climate Change", jurisdiction: "Central", level: "Central", website: "https://parivesh.nic.in/" },
  { name: "Maharashtra Pollution Control Board", jurisdiction: "Maharashtra", level: "State", website: "https://mpcb.gov.in/" },
  { name: "Maharashtra Fire & Emergency Services", jurisdiction: "Maharashtra", level: "State", website: "https://mahafireservice.gov.in/" },
  { name: "Employees' State Insurance Corporation", jurisdiction: "Central", level: "Central", website: "https://esic.gov.in/" },
];
/// Approval-type catalogue: JSON approval name -> platform code/dept/stage.
const APPROVAL_TYPES: {
  name: string;
  code: string;
  department: string;
  stage: string;
  validityDays: number | null;
  description: string;
}[] = [
  { name: "Environmental Clearance", code: "ENV_EC", department: "ENV", stage: "pre_establishment", validityDays: null, description: "Prior environmental clearance for scheduled projects" },
  { name: "PARIVESH Clearance Workflow", code: "ENV_EC", department: "ENV", stage: "pre_establishment", validityDays: null, description: "Online submission & tracking workflow (PARIVESH portal)" },
  { name: "Consent to Establish", code: "MPCB_CTE", department: "ENV", stage: "pre_establishment", validityDays: null, description: "Consent to establish the industry under Water & Air Acts" },
  { name: "Consent to Operate", code: "MPCB_CTO", department: "ENV", stage: "pre_operation", validityDays: 365, description: "Consent to operate the industry (annual renewal)" },
  { name: "Consent to Operate Renewal", code: "MPCB_CTO_REN", department: "ENV", stage: "renewal", validityDays: 365, description: "Annual renewal of Consent to Operate with pre-expiry alert" },
  { name: "Fire Approval / Provisional NOC", code: "FIRE_NOC_PROV", department: "FIRE", stage: "pre_operation", validityDays: null, description: "Provisional fire NOC issued before occupation" },
  { name: "Final Fire NOC", code: "FIRE_NOC_FINAL", department: "FIRE", stage: "post_operation", validityDays: 365, description: "Final NOC after construction & inspection" },
  { name: "ESI Employer Registration", code: "ESI_REG", department: "LABOUR", stage: "operation", validityDays: null, description: "Registration as an employer under ESI Act" },
];

const DOCUMENT_TYPES: { code: string; name: string; isMandatory: boolean }[] = [
  { code: "application_documents_as_prescribed", name: "Application documents as prescribed", isMandatory: true },
  { code: "project_specific_environmental_documents", name: "Project-specific environmental documents", isMandatory: true },
  { code: "employer_details", name: "Employer details", isMandatory: true },
  { code: "employee_details", name: "Employee details", isMandatory: true },
  { code: "establishment_details", name: "Establishment details", isMandatory: true },
  { code: "capital_investment_details", name: "Capital investment details", isMandatory: true },
  { code: "manufacturing_process", name: "Manufacturing process description", isMandatory: true },
  { code: "industry_registration", name: "Industry registration (Udyam / CIN)", isMandatory: true },
  { code: "land_ownership_certificate", name: "Land ownership certificate", isMandatory: true },
  { code: "pollution_control_system_proposal", name: "Pollution control system proposal", isMandatory: true },
  { code: "pollution_control_system_details", name: "Pollution control system details", isMandatory: true },
  { code: "previous_consent_copy", name: "Previous consent copy", isMandatory: true },
  { code: "previous_consent_if_applicable", name: "Previous consent (if applicable)", isMandatory: true },
  { code: "compliance_information", name: "Compliance information", isMandatory: true },
  { code: "required_environmental_reports", name: "Required environmental reports", isMandatory: true },
  { code: "application", name: "Application form", isMandatory: true },
  { code: "architectural_drawings", name: "Architectural drawings", isMandatory: true },
  { code: "floor_area_calculation", name: "Floor area calculation", isMandatory: true },
  { code: "industrial_process_flow", name: "Industrial process flow", isMandatory: true },
  { code: "fire_prevention_details", name: "Fire prevention details", isMandatory: true },
  { code: "raw_material_details", name: "Raw material details", isMandatory: true },
  { code: "finished_goods_details", name: "Finished goods details", isMandatory: true },
  { code: "applicable_other_agency_approvals", name: "Applicable other agency approvals", isMandatory: true },
  { code: "approved_drawings", name: "Approved drawings", isMandatory: true },
  { code: "provisional_noc", name: "Provisional NOC", isMandatory: true },
  { code: "inspection_certificate", name: "Inspection certificate", isMandatory: true },
];

const STAGE_PRIORITY: Record<string, number> = {
  any: 0,
  pre_establishment: 10,
  pre_operation: 20,
  operation: 30,
  renewal: 35,
  post_operation: 40,
};

/// Maps a rule's `approval` display name to its platform ApprovalType code.
function approvalCodeFor(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const found = APPROVAL_TYPES.find((at) => at.name === name);
  return found ? found.code : null;
}

/// Picks the Authority name for an approval-type code.
function authorityNameFor(code: string): string {
  if (code === "MPCB_CTE" || code === "MPCB_CTO") return AUTHORITIES[1].name;
  if (code.startsWith("FIRE")) return AUTHORITIES[2].name;
  if (code === "ESI_REG") return AUTHORITIES[3].name;
  return AUTHORITIES[0].name;
}

export async function seedMasterData(): Promise<void> {
  // 1) Departments
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name, description: d.description },
      create: d,
    });
  }
  console.log(`✓ Seeded ${DEPARTMENTS.length} departments`);

  // 2) Authorities
  for (const a of AUTHORITIES) {
    await prisma.authority.upsert({
      where: { name: a.name },
      update: { jurisdiction: a.jurisdiction, level: a.level, website: a.website },
      create: a,
    });
  }
  console.log(`✓ Seeded ${AUTHORITIES.length} authorities`);

  // 3) Document types
  for (const doc of DOCUMENT_TYPES) {
    await prisma.documentType.upsert({
      where: { code: doc.code },
      update: { name: doc.name, isMandatory: doc.isMandatory },
      create: doc,
    });
  }
  console.log(`✓ Seeded ${DOCUMENT_TYPES.length} document types`);

  // 4) Approval types (department + authority resolved from catalogue)
  let approvalCount = 0;
  for (const at of APPROVAL_TYPES) {
    const department = await prisma.department.findUnique({ where: { code: at.department } });
    const authority = await prisma.authority.findFirst({ where: { name: authorityNameFor(at.code) } });
    if (!department || !authority) throw new Error(`Master data missing for approval ${at.name}`);
    await prisma.approvalType.upsert({
      where: { code: at.code },
      update: { name: at.name, description: at.description, stage: at.stage, validityDays: at.validityDays, departmentId: department.id, authorityId: authority.id },
      create: { code: at.code, name: at.name, description: at.description, stage: at.stage, validityDays: at.validityDays, departmentId: department.id, authorityId: authority.id },
    });
    approvalCount += 1;
  }
  console.log(`✓ Seeded ${approvalCount} approval-type entries`);
  // 5) Regulatory rules from regulatory_rules.json + requirement links
  let rulesSeeded = 0;
  for (const rule of rulesFile.rules) {
    const authority = await prisma.authority.findUnique({ where: { name: rule.authority } });
    const approvalCode = approvalCodeFor(rule.approval);
    const approvalType = approvalCode
      ? await prisma.approvalType.findUnique({ where: { code: approvalCode } })
      : null;
    const department = approvalType
      ? await prisma.department.findUnique({ where: { id: approvalType.departmentId } })
      : null;
    const stage = (rule.action as { stage?: string })?.stage ?? "any";
    const priority = STAGE_PRIORITY[stage] ?? 0;

    await prisma.regulatoryRule.upsert({
      where: { ruleId: rule.rule_id },
      update: {
        jurisdiction: rule.jurisdiction,
        level: rule.level,
        authorityName: rule.authority,
        regulation: (rule as { regulation?: string }).regulation,
        conditions: (rule.conditions ?? {}) as object,
        action: (rule.action ?? {}) as object,
        requiredDocuments: (rule.required_documents ?? []) as string[],
        source: rule.source as object,
        lastVerified: rule.last_verified ? new Date(rule.last_verified) : null,
        verificationStatus: rule.verification_status ?? "unverified",
        priority,
        isActive: true,
        authorityId: authority?.id,
        departmentId: department?.id,
        approvalTypeId: approvalType?.id,
      },
      create: {
        ruleId: rule.rule_id,
        ruleType: rule.rule_type,
        jurisdiction: rule.jurisdiction,
        level: rule.level,
        authorityName: rule.authority,
        regulation: (rule as { regulation?: string }).regulation,
        conditions: (rule.conditions ?? {}) as object,
        action: (rule.action ?? {}) as object,
        requiredDocuments: (rule.required_documents ?? []) as string[],
        source: rule.source as object,
        effectiveFrom: null,
        lastVerified: rule.last_verified ? new Date(rule.last_verified) : null,
        verificationStatus: rule.verification_status ?? "unverified",
        priority,
        isActive: true,
        authorityId: authority?.id,
        departmentId: department?.id,
        approvalTypeId: approvalType?.id,
      },
    });
    rulesSeeded += 1;
  }
  console.log(`✓ Seeded ${rulesSeeded} regulatory rules`);

  // 6) Requirement links: each approval type -> documents demanded by its rules
  const approvals = await prisma.approvalType.findMany({ include: { rules: true } });
  let requirementLinks = 0;
  for (const approval of approvals) {
    const docCodes = new Set<string>();
    for (const rule of approval.rules) {
      const docs = rule.requiredDocuments as string[];
      for (const code of docs) docCodes.add(code);
    }
    for (const code of docCodes) {
      const docType = await prisma.documentType.findUnique({ where: { code } });
      if (!docType) continue;
      await prisma.approvalRequirement.upsert({
        where: { approvalTypeId_documentTypeId: { approvalTypeId: approval.id, documentTypeId: docType.id } },
        update: {},
        create: { approvalTypeId: approval.id, documentTypeId: docType.id },
      });
      requirementLinks += 1;
    }
  }
  console.log(`✓ Linked ${requirementLinks} approval→document requirements`);
}