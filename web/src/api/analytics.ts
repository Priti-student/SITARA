import { api } from "./client";

// ── Phase 9: dashboards, analytics & alerts ──

export interface OverviewTrendPoint {
  month: string;
  filed: number;
  approved: number;
}

export interface Overview {
  scope: "PLATFORM" | "MINE";
  kpis: {
    units: number;
    applications: number;
    activeTracks: number;
    overdueTracks: number;
    inspectionsCompleted: number;
    renewalsDue: number;
    openComplianceCases: number;
    openGrievances: number;
  };
  applications: Record<string, number>;
  approvalRate: number | null;
  inspections: Record<string, number>;
  claims: Record<string, number>;
  grievances: Record<string, number>;
  trend: OverviewTrendPoint[];
  departments: { code: string; name: string; active: number }[];
  generatedAt: string;
}

export interface AlertItem {
  key: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "SLA" | "RENEWAL" | "COMPLIANCE" | "GRIEVANCE" | "INCENTIVE" | "APPLICATION";
  title: string;
  message: string;
  href: string;
  count?: number;
  raisedAt: string;
}

export interface AlertFeed {
  items: AlertItem[];
  summary: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number; total: number };
}

export function getOverview(): Promise<Overview> {
  return api<Overview>("/analytics/overview");
}

export function getAlerts(limit?: number): Promise<AlertFeed> {
  return api<AlertFeed>(`/analytics/alerts${limit ? `?limit=${limit}` : ""}`);
}