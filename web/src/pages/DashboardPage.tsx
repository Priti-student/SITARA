import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const MODULES = [
  { title: "Approval Checklists", desc: "Regulatory knowledge engine (Phase 3)", soon: "Phase 3" },
  { title: "Applications", desc: "Guided forms & pre-validation (Phase 4)", soon: "Phase 4" },
  { title: "Department Workflows", desc: "Parallel scrutiny, SLAs & queries (Phase 5)", soon: "Phase 5" },
  { title: "Inspections", desc: "Joint planning & risk-based scrutiny (Phase 6)", soon: "Phase 6" },
  { title: "Renewals & Compliance", desc: "Alerts, renewals, condition tracking (Phase 7)", soon: "Phase 7" },
  { title: "Incentives & Schemes", desc: "Eligibility matching & utilisation (Phase 8)", soon: "Phase 8" },
];

export function DashboardPage() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <span className="chip chip-accent">{user.email}</span>
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