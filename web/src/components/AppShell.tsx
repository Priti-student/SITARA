import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DASHBOARDS, navGroupsFor, personaOf } from "../rbac";
import { listNotifications } from "../api/notifications";

/**
 * Shared authenticated layout: role-aware topbar + sidebar navigation
 * around the routed page. What a user sees is derived entirely from
 * their roles (see rbac.ts) — no per-page headers anymore.
 */
export function AppShell() {
  const { user, signOut } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    listNotifications().then((result) => setUnreadCount(result.unreadCount)).catch(() => setUnreadCount(0));
  }, []);
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
        <nav className="topbar-nav" aria-label="Account">
          <Link to="/notifications" className="notification-bell" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            {unreadCount > 0 ? <span>{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
          </Link>
          <div className="topbar-profile">
            <span className="profile-avatar" aria-hidden="true">{user.fullName.trim().charAt(0).toUpperCase()}</span>
            <span className="profile-copy"><strong>{user.fullName}</strong><small>{persona === "APPLICANT" ? "Industrial Unit" : dash.label}</small></span>
            <span className="profile-chevron" aria-hidden="true">⌄</span>
          </div>
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
