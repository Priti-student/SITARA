import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluateConditions } from "../src/rules/conditions.js";

describe("evaluateCondition", () => {
  const ctx = {
    state: "Maharashtra",
    industryType: "pharmaceuticals",
    employeeCount: 120,
    capitalInvestment: 50000000,
    pollution_relevant_activity: true,
    construction_completed: false,
    clearance_type: ["environmental", "crz"],
  };

  it("matches boolean flags strictly", () => {
    expect(evaluateCondition("pollution_relevant_activity", true, ctx)).toBe(true);
    expect(evaluateCondition("construction_completed", true, ctx)).toBe(false);
    expect(evaluateCondition("pollution_relevant_activity", false, ctx)).toBe(false);
  });

  it("applies numeric comparison suffixes (_gte/_lt/…)", () => {
    expect(evaluateCondition("employee_count_gte", 10, ctx)).toBe(true);
    expect(evaluateCondition("employee_count_gte", 130, ctx)).toBe(false);
    expect(evaluateCondition("capitalInvestment_lte", 1e8, ctx)).toBe(true);
    expect(evaluateCondition("employee_count_lt", 120, ctx)).toBe(false);
  });

  it("matches strings and numbers by equality", () => {
    expect(evaluateCondition("state", "Maharashtra", ctx)).toBe(true);
    expect(evaluateCondition("state", "Gujarat", ctx)).toBe(false);
    expect(evaluateCondition("employeeCount", 120, ctx)).toBe(true);
    expect(evaluateCondition("employeeCount", 121, ctx)).toBe(false);
  });

  it("checks list membership for scalar context values", () => {
    expect(evaluateCondition("industryType", ["pharma", "pharmaceuticals"], ctx)).toBe(true);
    expect(evaluateCondition("industryType", ["cement"], ctx)).toBe(false);
  });

  it("intersects arrays in context", () => {
    expect(evaluateCondition("clearance_type", ["environmental", "forest", "wildlife", "crz"], ctx)).toBe(true);
    expect(evaluateCondition("clearance_type", ["crz"], ctx)).toBe(true);
    expect(evaluateCondition("clearance_type", ["forest"], ctx)).toBe(false);
    expect(evaluateCondition("clearance_type", ["defence"], ctx)).toBe(false);
  });

  it("returns false for missing context keys", () => {
    expect(evaluateCondition("missing_flag", true, ctx)).toBe(false);
    expect(evaluateCondition("missing_val_gte", 5, ctx)).toBe(false);
  });
});

describe("evaluateConditions", () => {
  const ctx = { establishment_type: "factory", employeeCount: 25 };

  it("ANDs multiple entries (ESI-like rule)", () => {
    expect(
      evaluateConditions(
        { establishment_type: "factory", employee_count_gte: 10 },
        ctx
      )
    ).toBe(true);
    expect(
      evaluateConditions(
        { establishment_type: "factory", employee_count_gte: 100 },
        ctx
      )
    ).toBe(false);
  });

  it("supports anyOf combinators", () => {
    expect(
      evaluateConditions(
        { anyOf: [{ industryType: "cement" }, { establishment_type: "factory" }] },
        ctx
      )
    ).toBe(true);
    expect(
      evaluateConditions(
        { anyOf: [{ industryType: "cement" }, { state: "UP" }] },
        ctx
      )
    ).toBe(false);
  });

  it("treats an empty condition set as always-true", () => {
    expect(evaluateConditions({}, ctx)).toBe(true);
  });
});