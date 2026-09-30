import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const MODULES = [
  { title: "Approval Checklists", desc: "Discovery wizard + personalised checklist — live", soon: "Live", href: "/checklists" },
  { title: "New Checklist Wizard", desc: "5-step discovery → engine evaluation → save", soon: "Live", href: "/checklists/new" },
  { title: "Notifications", desc: "In-app alerts on checklist & workflow events", soon: "Live", href: "/notifications" },
  { title: "Applications", desc: "Guided forms & pre-validation — live", soon: "Live", href: "/applications" },
  { title: "Department Workflows", desc: "Parallel tracks, officer inbox, SLAs & queries — live", soon: "Live", href: "/department" },
  { title: "Inspections", desc: "Joint planning & risk-based scrutiny — live", soon: "Live", href: "/inspections" },
  { title: "Renewals", desc: "Expiry countdowns, pre-expiry alerts & renewal applications — live", soon: "Live", href: "/renewals" },
  { title: "Compliance Monitoring", desc: "Remediation cases from inspection verdicts — live", soon: "Live", href: "/compliance" },
  { title: "Incentive Schemes", desc: "Government incentives with live eligibility checks — live", soon: "Live", href: "/schemes" },
  { title: "Claims & Utilisation", desc: "Sanction → disbursement → utilisation with full audit trail — live", soon: "Live", href: "/claims" },
  { title: "Analytics & Alerts", desc: "KPI overview, 6-month trend, workload & consolidated alert feed — live", soon: "Live", href: "/analytics" },
  { title: "Grievances", desc: "SLA-tracked filings with acknowledgement, response & auto-escalation — live", soon: "Live", href: "/grievances" },
];

export function DashboardPage() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  const isAdmin = user.roles.some((r) => r === "SUPER_ADMIN" || r === "STATE_ADMIN");

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <span className="chip chip-accent">{user.email}</span>
          {isAdmin ? (
            <Link to="/rules" className="btn btn-ghost btn-sm">
              Rule Engine
            </Link>
          ) : null}
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>
            Sign out
          </Link>
        </nav>
      </header>

      <main>
        <section className="welcome">
          <h1>
            Welcome back, <span className="accent">{user.fullName}</span>
          </h1>
          <p>
            Your account is ready. Core modules arrive in the coming phases —
            here is what SITARA is building for you.
          </p>
        </section>

        <section className="feature-grid">
          {MODULES.map((m) => (
            <div className="feature-card module-card" key={m.title}>
              <div className="module-title-row">
                <h3>{m.title}</h3>
                <span className="badge">{m.soon}</span>
              </div>
              <p>{m.desc}</p>
              {m.href ? <Link to={m.href} className="btn btn-ghost btn-sm">Open</Link> : null}
            </div>
          ))}
        </section>

        <p className="dashboard-tip">
          Tip: explore the API at{" "}
          <code>http://localhost:4000/api/v1/health</code> · docs in README.
        </p>
      </main>
    </div>
  );
}