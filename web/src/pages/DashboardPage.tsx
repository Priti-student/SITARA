import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DASHBOARDS, personaOf } from "../rbac";

/**
 * Role-aware dashboard: welcome, quick actions and module cards are
 * chosen from the user's persona (see rbac.ts). The shell around it
 * (topbar + sidebar) is provided by AppShell.
 */
export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const dash = DASHBOARDS[personaOf(user.roles)];

  return (
    <div className="page">
      <section className="welcome">
        <span className="chip chip-accent">{dash.eyebrow}</span>
        <h1>
          Welcome back, <span className="accent">{user.fullName}</span>
        </h1>
        <p>{dash.blurb}</p>
        <div className="hero-actions-row">
          {dash.actions.map((a, i) => (
            <Link
              key={a.to}
              to={a.to}
              className={`btn ${i === 0 ? "btn-primary" : "btn-ghost"}`}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="feature-grid">
        {dash.cards.map((m) => (
          <div className="feature-card module-card" key={m.title}>
            <div className="module-title-row">
              <h3>{m.title}</h3>
              <span className="badge">Live</span>
            </div>
            <p>{m.desc}</p>
            <Link to={m.href} className="btn btn-ghost btn-sm">
              Open
            </Link>
          </div>
        ))}
      </section>

      <p className="dashboard-tip">{dash.tip}</p>
    </div>
  );
}
