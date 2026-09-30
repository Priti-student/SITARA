// ───────────────────────────────────────────────────────────────
// Role-based access control (frontend) — the single source of
// truth for personas, navigation and route permissions. Mirrors
// the backend RBAC (server/src/middleware/auth.ts + routes).
// ───────────────────────────────────────────────────────────────

export type Role =
  | "SUPER_ADMIN"
  | "STATE_ADMIN"
  | "DEPARTMENT_USER"
  | "APPROVING_AUTHORITY"
  | "INSPECTOR"
  | "APPLICANT"
  | "UNIT_USER";

export const ALL_ROLES: Role[] = [
  "SUPER_ADMIN",
  "STATE_ADMIN",
  "DEPARTMENT_USER",
  "APPROVING_AUTHORITY",
  "INSPECTOR",
  "APPLICANT",
  "UNIT_USER",
];

/** The persona that drives the dashboard + navigation a user sees. */
export type Persona = "ADMIN" | "OFFICER" | "INSPECTOR" | "APPLICANT";

/** True when the user holds at least one of the allowed roles. */
export function hasAnyRole(userRoles: string[], allowed: Role[]): boolean {
  return userRoles.some((r) => allowed.includes(r as Role));
}

/**
 * Resolves the primary persona for a user. Priority when a user holds
 * several roles: administration > department desk > field > industry side.
 */
export function personaOf(userRoles: string[]): Persona {
  if (hasAnyRole(userRoles, ["SUPER_ADMIN", "STATE_ADMIN"])) return "ADMIN";
  if (hasAnyRole(userRoles, ["APPROVING_AUTHORITY", "DEPARTMENT_USER"])) return "OFFICER";
  if (hasAnyRole(userRoles, ["INSPECTOR"])) return "INSPECTOR";
  return "APPLICANT";
}

// ─── Navigation ────────────────────────────────────────────────

export interface NavItem {
  to: string;
  label: string;
  /** Highlighted as the primary call-to-action. */
  primary?: boolean;
  /** Optional per-item roles (defaults to the group's roles). */
  roles?: Role[];
}

export interface NavGroup {
  title: string;
  roles: Role[];
  items: NavItem[];
}

const APPLICANT_SIDE: Role[] = ["APPLICANT", "UNIT_USER"];
const DESKS: Role[] = ["DEPARTMENT_USER", "APPROVING_AUTHORITY"];
const OVERSIGHT: Role[] = [...DESKS, "INSPECTOR", "STATE_ADMIN", "SUPER_ADMIN"];

/** Sidebar groups. Each link appears once per persona (role sets are disjoint). */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    roles: ALL_ROLES,
    items: [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/notifications", label: "Notifications" },
    ],
  },
  {
    title: "Apply",
    roles: APPLICANT_SIDE,
    items: [
      { to: "/checklists/new", label: "New Checklist Wizard", primary: true },
      { to: "/checklists", label: "My Checklists" },
      { to: "/applications", label: "My Applications" },
    ],
  },
  {
    title: "Lifecycle",
    roles: APPLICANT_SIDE,
    items: [
      { to: "/renewals", label: "Renewals" },
      { to: "/compliance", label: "Compliance Cases" },
      { to: "/schemes", label: "Incentive Schemes" },
      { to: "/claims", label: "Claims & Utilisation" },
    ],
  },
  {
    title: "Scrutiny",
    roles: [...DESKS, "STATE_ADMIN", "SUPER_ADMIN"],
    items: [{ to: "/department", label: "Department Inbox", primary: true }],
  },
  {
    title: "Field Work",
    roles: OVERSIGHT,
    items: [{ to: "/inspections", label: "Inspections" }],
  },
  {
    title: "Monitoring",
    roles: OVERSIGHT,
    items: [
      { to: "/compliance", label: "Compliance Monitoring" },
      { to: "/analytics", label: "Analytics & Alerts" },
      { to: "/claims", label: "Claims Review", roles: [...DESKS, "STATE_ADMIN", "SUPER_ADMIN"] },
      { to: "/renewals", label: "Renewals Oversight", roles: ["STATE_ADMIN", "SUPER_ADMIN"] },
    ],
  },
  {
    title: "Support",
    roles: ALL_ROLES,
    items: [{ to: "/grievances", label: "Grievances" }],
  },
  {
    title: "Administration",
    roles: ["STATE_ADMIN", "SUPER_ADMIN"],
    items: [{ to: "/rules", label: "Knowledge Rules" }],
  },
];

/** Nav groups the given roles may see (groups with no visible items are dropped). */
export function navGroupsFor(userRoles: string[]): { title: string; items: NavItem[] }[] {
  return NAV_GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter((it) => hasAnyRole(userRoles, it.roles ?? g.roles)),
  })).filter((g) => g.items.length > 0);
}

// ─── Route permissions (frontend guards; backend re-checks) ───

export const ROUTE_ROLES = {
  /** Admin-only pages (knowledge rule catalogue). */
  rules: ["STATE_ADMIN", "SUPER_ADMIN"] as Role[],
  /** Unit-centric pages: checklists, applications, scheme filing. */
  applicant: APPLICANT_SIDE as Role[],
  /** Officer desks (inbox + case views). */
  officer: [...DESKS, "STATE_ADMIN", "SUPER_ADMIN"] as Role[],
  /** Joint-inspection readers/actors (inspectors included). */
  inspections: OVERSIGHT as Role[],
} as const;

// ─── Persona dashboards ────────────────────────────────────────

export interface DashAction {
  to: string;
  label: string;
}

export interface DashCard {
  title: string;
  desc: string;
  href: string;
}

export interface PersonaDashboard {
  /** Chip shown in the topbar. */
  label: string;
  /** Welcome eyebrow, e.g. "Industry Portal". */
  eyebrow: string;
  blurb: string;
  actions: DashAction[];
  cards: DashCard[];
  tip: string;
}

const NOTIF_CARD: DashCard = {
  title: "Notifications",
  desc: "Alerts on queries, inspections, decisions and renewals",
  href: "/notifications",
};

export const DASHBOARDS: Record<Persona, PersonaDashboard> = {
  APPLICANT: {
    label: "Industry",
    eyebrow: "Industry Portal",
    blurb:
      "Generate your approval checklist, apply with guided forms and track every sanction, renewal and incentive for your units.",
    actions: [
      { to: "/checklists/new", label: "New Checklist Wizard" },
      { to: "/applications", label: "Start an application" },
      { to: "/grievances", label: "File a grievance" },
    ],
    cards: [
      { title: "My Approval Checklists", desc: "Personalised checklists from the Regulatory Knowledge Engine", href: "/checklists" },
      { title: "My Applications", desc: "Guided forms, pre-validation and live approval tracking", href: "/applications" },
      { title: "Renewals", desc: "Expiry countdowns, pre-expiry alerts and renewal filings", href: "/renewals" },
      { title: "Compliance Cases", desc: "Remediation notices and closure for your units", href: "/compliance" },
      { title: "Incentive Schemes", desc: "Government incentives with live eligibility checks", href: "/schemes" },
      { title: "Claims & Utilisation", desc: "Sanction → disbursement → utilisation with full audit trail", href: "/claims" },
      { title: "Grievances", desc: "SLA-tracked escalation of service issues", href: "/grievances" },
      NOTIF_CARD,
    ],
    tip: "Tip: verified documents are reused across applications — upload once, apply everywhere.",
  },
  OFFICER: {
    label: "Department",
    eyebrow: "Department Desk",
    blurb:
      "Work your parallel scrutiny tracks against SLA timers, raise queries, plan joint inspections and close compliance cases.",
    actions: [
      { to: "/department", label: "Open Department Inbox" },
      { to: "/inspections", label: "Inspections" },
      { to: "/grievances", label: "Grievance Desk" },
    ],
    cards: [
      { title: "Department Inbox", desc: "Active tracks, SLA countdowns and the query loop", href: "/department" },
      { title: "Inspections", desc: "Joint visit planning, assignments and field reports", href: "/inspections" },
      { title: "Compliance Monitoring", desc: "Verify remediations and resolve cases", href: "/compliance" },
      { title: "Analytics & Alerts", desc: "Your desk's workload, delays and bottlenecks", href: "/analytics" },
      { title: "Grievance Desk", desc: "Acknowledge, respond and resolve within SLA", href: "/grievances" },
      { title: "Claims Review", desc: "Scrutinise and sanction incentive claims", href: "/claims" },
      NOTIF_CARD,
    ],
    tip: "Tip: risk-based scrutiny flags — clear low-risk cases from the desk, escalate the rest.",
  },
  INSPECTOR: {
    label: "Inspector",
    eyebrow: "Field Inspector",
    blurb:
      "See your assigned joint visits, file department observations and track how your findings drive compliance outcomes.",
    actions: [{ to: "/inspections", label: "My Inspections" }],
    cards: [
      { title: "My Inspections", desc: "Assigned visits, checklists and field observations", href: "/inspections" },
      { title: "Compliance Monitoring", desc: "Outcomes of the cases your findings opened", href: "/compliance" },
      { title: "Analytics & Alerts", desc: "Field workload and overdue visits", href: "/analytics" },
      { title: "Grievances", desc: "Visibility into service issues you can inform", href: "/grievances" },
      NOTIF_CARD,
    ],
    tip: "Tip: file observations per department — the consolidated report is built from them.",
  },
  ADMIN: {
    label: "Administration",
    eyebrow: "State Command Centre",
    blurb:
      "Oversight of every desk: KPIs, SLA breaches, cross-department bottlenecks, scheme utilisation and grievance escalations.",
    actions: [
      { to: "/analytics", label: "Open Command Centre" },
      { to: "/department", label: "All Department Desks" },
      { to: "/rules", label: "Knowledge Rules" },
    ],
    cards: [
      { title: "Analytics & Alerts", desc: "State KPIs, 6-month trend and delay hotspots", href: "/analytics" },
      { title: "Department Inbox", desc: "All desks with cross-department SLA oversight", href: "/department" },
      { title: "Inspections", desc: "Common inspection planning across departments", href: "/inspections" },
      { title: "Compliance Monitoring", desc: "Statewide remediation closure tracking", href: "/compliance" },
      { title: "Grievance Escalation", desc: "Auto-escalated cases awaiting intervention", href: "/grievances" },
      { title: "Renewals Oversight", desc: "Expiry sweeps and pre-expiry alert management", href: "/renewals" },
      { title: "Knowledge Rules", desc: "Regulatory rule catalogue backing the engine", href: "/rules" },
      { title: "Claims & Utilisation", desc: "Scheme utilisation across the state", href: "/claims" },
      NOTIF_CARD,
    ],
    tip: "Tip: run the SLA pass from any department inbox to surface overdue tracks instantly.",
  },
};

