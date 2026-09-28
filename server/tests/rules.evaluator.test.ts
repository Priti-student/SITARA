import { describe, expect, it } from "vitest";
import { evaluateRules } from "../src/rules/evaluator.js";
import type { RuleLike, EvaluationContext } from "../src/rules/types.js";

function rule(partial: Partial<RuleLike> & { ruleId: string }): RuleLike {
  return {
    ruleType: "applicability",
    conditions: {},
    action: {},
    requiredDocuments: [],
    priority: 0,
    approvalType: null,
    ...partial,
  };
}

function at(code: string, over: Partial<NonNullable<RuleLike["approvalType"]>> = {}) {
  return {
    code,
    name: code,
    stage: "pre_establishment",
    authority: { name: "Test Authority", level: "State", jurisdiction: "Maharashtra" },
    department: { name: "Test Dept" },
    ...over,
  };
}

const CTX: EvaluationContext = {
  state: "Maharashtra",
  industryType: "pharmaceuticals",
  employeeCount: 120,
  pollution_relevant_activity: true,
  clearance_type: ["environmental"],
  provisional_fire_noc_issued: false,
  construction_completed: false,
};

describe("evaluateRules — approval applicability", () => {
  it("collects applicable approvals with merged documents", () => {
    const result = evaluateRules(
      [
        rule({
          ruleId: "CTE",
          ruleType: "applicability",
          conditions: { pollution_relevant_activity: true },
          action: { approval_required: true, stage: "pre_establishment" },
          requiredDocuments: ["industry_registration", "land_ownership_certificate"],
          priority: 10,
          approvalType: at("MPCB_CTE", { name: "Consent to Establish" }),
        }),
        rule({
          ruleId: "CTO",
          ruleType: "applicability",
          conditions: { pollution_relevant_activity: true },
          action: { approval_required: true, stage: "pre_operation", alert_before_expiry_days: 60 },
          requiredDocuments: ["compliance_information"],
          priority: 20,
          approvalType: at("MPCB_CTO", { name: "Consent to Operate", stage: "pre_operation", validityDays: 365 }),
        }),
        rule({ ruleId: "SKIP", conditions: { state: "Gujarat" }, approvalType: at("OTHER") }),
      ],
      CTX
    );

    expect(result.firedRuleIds).toEqual(["CTE", "CTO"]);
    expect(result.applicableApprovals.map((a) => a.approvalCode).sort()).toEqual(["MPCB_CTE", "MPCB_CTO"]);
    const cte = result.applicableApprovals.find((a) => a.approvalCode === "MPCB_CTE")!;
    expect(cte.requiredDocuments).toContain("industry_registration");
    expect(cte.requiredDocuments).toContain("land_ownership_certificate");
    const cto = result.applicableApprovals.find((a) => a.approvalCode === "MPCB_CTO")!;
    expect(cto.renewalAlertDays).toBe(60);
    expect(cto.validityDays).toBe(365);
  });

  it("is ordered by priority then stage", () => {
    const result = evaluateRules(
      [
        rule({ ruleId: "LATE", priority: 20, approvalType: at("B") }),
        rule({ ruleId: "EARLY", priority: 10, approvalType: at("A") }),
      ],
      {}
    );
    expect(result.applicableApprovals.map((a) => a.approvalCode)).toEqual(["A", "B"]);
  });
});

describe("evaluateRules — risk classification (MPCB RED)", () => {
  it("classifies RED industries", () => {
    const result = evaluateRules(
      [
        rule({
          ruleId: "RED",
          ruleType: "classification",
          conditions: { industryType: ["distillery", "sugar", "fertilizer", "cement", "thermal_power", "pharmaceuticals"] },
          action: { pollution_category: "RED" },
        }),
      ],
      CTX
    );
    expect(result.classification?.category).toBe("RED");
    expect(result.classification?.sourceRuleId).toBe("RED");
  });

  it("leaves classification null when conditions do not match", () => {
    const result = evaluateRules(
      [
        rule({
          ruleId: "RED",
          ruleType: "classification",
          conditions: { industryType: ["cement"] },
          action: { pollution_category: "RED" },
        }),
      ],
      { ...CTX, industryType: "textile" }
    );
    expect(result.classification).toBeNull();
  });
});

describe("evaluateRules — workflow rules", () => {
  it("attaches workflow notes and documents to gated approvals (Final Fire NOC)", () => {
    const finalNoc = at("FIRE_NOC_FINAL", { name: "Final Fire NOC", stage: "post_operation" });
    const result = evaluateRules(
      [
        rule({
          ruleId: "FINAL",
          ruleType: "workflow",
          conditions: { provisional_fire_noc_issued: true, construction_completed: true },
          action: { final_inspection_required: true, final_noc_required: true },
          requiredDocuments: ["approved_drawings", "provisional_noc", "inspection_certificate"],
          approvalType: finalNoc,
        }),
      ],
      { ...CTX, provisional_fire_noc_issued: true, construction_completed: true }
    );
    expect(result.applicableApprovals).toHaveLength(1);
    const appr = result.applicableApprovals[0];
    expect(appr.approvalCode).toBe("FIRE_NOC_FINAL");
    expect(appr.workflowNotes).toContain("Final inspection required");
    expect(appr.requiredDocuments).toContain("inspection_certificate");
    expect(result.workflowHints).toContain("Final inspection required");
  });

  it("does not fire when gating conditions are unmet", () => {
    const result = evaluateRules(
      [
        rule({
          ruleId: "FINAL",
          ruleType: "workflow",
          conditions: { provisional_fire_noc_issued: true, construction_completed: true },
          action: {},
          approvalType: at("FIRE_NOC_FINAL"),
        }),
      ],
      CTX // provisional_fire_noc_issued: false
    );
    expect(result.applicableApprovals).toHaveLength(0);
  });

  it("adds PARIVESH hints to an existing approval (online submission)", () => {
    const result = evaluateRules(
      [
        rule({
          ruleId: "EC",
          ruleType: "applicability",
          conditions: { project_requires_environmental_clearance: true },
          action: { approval_required: true, stage: "pre_establishment" },
          approvalType: at("ENV_EC", { name: "Environmental Clearance" }),
        }),
        rule({
          ruleId: "PARIVESH",
          ruleType: "workflow",
          conditions: { clearance_type: ["environmental", "forest", "wildlife", "crz"] },
          action: { online_submission: true, status_tracking: true },
          approvalType: at("ENV_EC", { name: "Environmental Clearance" }),
        }),
      ],
      { ...CTX, project_requires_environmental_clearance: true }
    );

    const ec = result.applicableApprovals.find((a) => a.approvalCode === "ENV_EC")!;
    expect(ec.workflowNotes).toContain("Online submission available");
    expect(ec.workflowNotes).toContain("Live status tracking");
  });
});