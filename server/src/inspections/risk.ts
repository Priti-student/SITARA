// ───────────────────────────────────────────────────────────────
// Risk scoring (Phase 6) — pure, deterministic risk-based scrutiny.
// Feeds RiskAssessment rows and inspection planning.
// ───────────────────────────────────────────────────────────────

export type RiskCategory = "LOW" | "MEDIUM" | "HIGH";
export type ScrutinyLevel = "DESK" | "ENHANCED" | "PHYSICAL";

export interface RiskFactor {
  code: string;
  label: string;
  points: number;
  detail?: string;
}

export interface RiskSignals {
  /** Rule-engine classification on the linked checklist (RED / AMBER / GREEN…). */
  riskCategory: string | null;
  capitalInvestment: number | null;
  employeeCount: number | null;
  /** Count of application documents rejected at pre-validation. */
  rejectedDocuments: number;
  /** Count of the unit's other applications that were rejected. */
  priorRejections: number;
  /** Count of the unit's completed inspections that were not fully compliant. */
  priorNonCompliances: number;
}

export interface RiskResult {
  score: number;
  category: RiskCategory;
  scrutinyLevel: ScrutinyLevel;
  requiresInspection: boolean;
  factors: RiskFactor[];
}

/** Classification-driven factor points (RED-family industries carry the base load). */
function classificationPoints(riskCategory: string | null): { points: number; detail?: string } {
  const c = (riskCategory ?? "").toUpperCase();
  if (c === "RED" || c === "HIGH") return { points: 40, detail: `Classification ${c}` };
  if (c === "AMBER" || c === "ORANGE" || c === "MEDIUM") return { points: 20, detail: `Classification ${c}` };
  return { points: 0 };
}

/**
 * Scores an application 0–100 and maps it to a scrutiny level.
 * ≥60 → HIGH (physical inspection expected), ≥30 → MEDIUM (enhanced desk
 * scrutiny), otherwise LOW (fast-track desk scrutiny).
 */
export function scoreRisk(signals: RiskSignals): RiskResult {
  const factors: RiskFactor[] = [];

  const cls = classificationPoints(signals.riskCategory);
  factors.push({
    code: "CLASSIFICATION",
    label: "Pollution / risk classification",
    points: cls.points,
    detail: cls.detail ?? "No classification rule fired",
  });

  const capital = signals.capitalInvestment ?? 0;
  const capitalPoints = capital >= 100_000_000 ? 25 : capital >= 10_000_000 ? 12 : 0;
  factors.push({
    code: "CAPITAL",
    label: "Capital investment",
    points: capitalPoints,
    detail: capital > 0 ? `₹${(capital / 100_000_000).toFixed(2)} Cr` : "Not declared",
  });

  const employees = signals.employeeCount ?? 0;
  const employeePoints = employees >= 100 ? 15 : employees >= 50 ? 5 : 0;
  factors.push({
    code: "WORKFORCE",
    label: "Workforce size",
    points: employeePoints,
    detail: employees > 0 ? `${employees} employees` : "Not declared",
  });

  const docPoints = signals.rejectedDocuments > 0 ? 10 : 0;
  factors.push({
    code: "DOCUMENTS",
    label: "Rejected documents",
    points: docPoints,
    detail: `${signals.rejectedDocuments} rejected at pre-validation`,
  });

  const historyPoints = signals.priorRejections > 0 ? 10 : 0;
  factors.push({
    code: "HISTORY",
    label: "Prior application rejections",
    points: historyPoints,
    detail: `${signals.priorRejections} rejected application(s) for this unit`,
  });

  const compliancePoints = signals.priorNonCompliances > 0 ? 30 : 0;
  factors.push({
    code: "COMPLIANCE",
    label: "Prior inspection non-compliance",
    points: compliancePoints,
    detail: `${signals.priorNonCompliances} non-compliant inspection(s)`,
  });

  const score = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0));
  const category: RiskCategory = score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  const scrutinyLevel: ScrutinyLevel = category === "HIGH" ? "PHYSICAL" : category === "MEDIUM" ? "ENHANCED" : "DESK";

  return { score, category, scrutinyLevel, requiresInspection: scrutinyLevel === "PHYSICAL", factors };
}