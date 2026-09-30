import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DASHBOARDS, navGroupsFor, personaOf } from "../rbac";

/**
 * Shared authenticated layout: role-aware topbar + sidebar navigation
 * around the routed page. What a user sees is derived entirely from
 * their roles (see rbac.ts) — no per-page headers anymore.
 */
export function AppShell() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  const persona = personaOf(user.roles);
  const dash = DASHBOARDS[persona];
  const groups = navGroupsFor(user.roles);

  return (
    <div className="dashboard">
      <header className="topbar">
        <Link to="/dashboard" className="topbar-brand">
          SITARA
        </Link>
        <span className="chip chip-accent">{dash.label}</span>
        <nav className="topbar-nav">
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <span className="chip topbar-email">{user.email}</span>
          <Link to="/notifications" className="btn btn-ghost btn-sm">
            Alerts
          </Link>
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>
            Sign out
          </Link>
        </nav>
      </header>

      <div className="shell-body">
        <aside className="sidenav">
          <div className="sidenav-persona">
            <strong>{dash.eyebrow}</strong>
            <span>{user.fullName}</span>
          </div>
          {groups.map((g) => (
            <div className="sidenav-group" key={g.title}>
              <div className="sidenav-group-title">{g.title}</div>
              {g.items.map((it) => (
                <NavLink
                  key={`${g.title}-${it.to}`}
                  to={it.to}
                  end={it.to === "/dashboard"}
                  className={({ isActive }) =>
                    ["sidenav-link", it.primary ? "sidenav-link-primary" : "", isActive ? "active" : ""]
                      .filter(Boolean)
                      .join(" ")
                  }
                >
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </aside>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
