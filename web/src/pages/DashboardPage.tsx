import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DASHBOARDS, personaOf } from "../rbac";
import { getAlerts, getOverview, type AlertFeed, type Overview } from "../api/analytics";

const KPI_ICONS: Record<string, string> = {
  applications: "▤", active: "◷", overdue: "!", inspections: "⌖", units: "⌂", compliance: "✓", grievances: "◌", renewals: "↻",
};

function kpisFor(persona: ReturnType<typeof personaOf>, overview: Overview) {
  const k = overview.kpis;
  if (persona === "APPLICANT") return [
    { label: "My units", value: k.units, icon: "units" }, { label: "Applications", value: k.applications, icon: "applications" },
    { label: "Active approvals", value: k.activeTracks, icon: "active" }, { label: "Renewals due", value: k.renewalsDue, icon: "renewals" },
  ];
  if (persona === "INSPECTOR") return [
    { label: "Assigned visits", value: overview.inspections.SCHEDULED ?? 0, icon: "inspections" }, { label: "In progress", value: overview.inspections.IN_PROGRESS ?? 0, icon: "active" },
    { label: "Completed", value: k.inspectionsCompleted, icon: "compliance" }, { label: "Open findings", value: k.openComplianceCases, icon: "overdue" },
  ];
  if (persona === "OFFICER") return [
    { label: "Active tracks", value: k.activeTracks, icon: "active" }, { label: "Applications", value: k.applications, icon: "applications" },
    { label: "Overdue SLAs", value: k.overdueTracks, icon: "overdue" }, { label: "Open grievances", value: k.openGrievances, icon: "grievances" },
  ];
  return [
    { label: "Registered units", value: k.units, icon: "units" }, { label: "Applications", value: k.applications, icon: "applications" },
    { label: "Overdue SLAs", value: k.overdueTracks, icon: "overdue" }, { label: "Inspections done", value: k.inspectionsCompleted, icon: "inspections" },
  ];
}

export function DashboardPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [feed, setFeed] = useState<AlertFeed | null>(null);
  useEffect(() => {
    getOverview().then(setOverview).catch(() => setOverview(null));
    getAlerts(5).then(setFeed).catch(() => setFeed(null));
  }, []);

  if (!user) return null;
  const persona = personaOf(user.roles);
  const dash = DASHBOARDS[persona];

  const maxTrend = overview ? Math.max(1, ...overview.trend.map((point) => point.filed)) : 1;
  const kpis = overview ? kpisFor(persona, overview) : [];

  return (
    <div className="page role-dashboard">
      <section className="dashboard-banner">
        <div className="dashboard-banner-copy">
          <span className="chip chip-accent">{dash.eyebrow}</span>
          <h1>Welcome back, <span>{user.fullName}</span></h1>
          <p>{dash.blurb}</p>
          <div className="hero-actions-row">
            {dash.actions.map((a, i) => <Link key={a.to} to={a.to} className={`btn ${i === 0 ? "btn-primary" : "btn-ghost"}`}>{a.label}</Link>)}
          </div>
        </div>
        <div className="dashboard-banner-message"><i aria-hidden="true" /><strong>Faster approvals.<br />Stronger industry.<br />A compliant tomorrow.</strong></div>
      </section>

      {overview ? <section className="dashboard-kpis" aria-label="Key performance indicators">
        {kpis.map((item) => <article className={`dashboard-kpi${item.icon === "overdue" && Number(item.value) > 0 ? " is-alert" : ""}`} key={item.label}>
          <span className={`kpi-icon kpi-icon-${item.icon}`} aria-hidden="true">{KPI_ICONS[item.icon]}</span>
          <span className="kpi-label">{item.label}</span><strong>{item.value}</strong>
        </article>)}
      </section> : <p className="muted-text dashboard-loading">Loading your dashboard summary…</p>}

      <div className="dashboard-content-grid">
        <section className="dashboard-workspace">
          <div className="dashboard-section-heading"><div><span className="section-kicker">Your workspace</span><h2>Services &amp; tasks</h2></div></div>
          <div className="dashboard-modules">
            {dash.cards.map((m) => <article className="feature-card module-card" key={m.title}>
              <div className="module-title-row"><h3>{m.title}</h3><span className="badge">Open</span></div>
              <p>{m.desc}</p><Link to={m.href} className="btn btn-ghost btn-sm">View details <span aria-hidden="true">→</span></Link>
            </article>)}
          </div>
          <p className="dashboard-tip">{dash.tip}</p>
        </section>

        <aside className="dashboard-rail">
          <section className="dashboard-panel">
            <div className="dashboard-panel-heading"><div><span className="section-kicker">Needs attention</span><h2>Recent alerts</h2></div><Link to="/notifications">All alerts →</Link></div>
            {feed?.items.length ? <ul className="dashboard-alerts">{feed.items.map((alert) => <li key={alert.key}>
              <span className={`alert-dot alert-dot-${alert.severity.toLowerCase()}`} aria-hidden="true" />
              <div><Link to={alert.href} className="dashboard-alert-title">{alert.title}</Link><p>{alert.message}</p></div>
            </li>)}</ul> : <p className="dashboard-empty">{feed ? "No active alerts. You’re all caught up." : "Alerts will appear here when available."}</p>}
          </section>
          {overview?.trend?.length ? <section className="dashboard-panel">
            <div className="dashboard-panel-heading"><div><span className="section-kicker">Activity</span><h2>Application trend</h2></div><Link to="/analytics">Analytics →</Link></div>
            <div className="dashboard-mini-chart" role="img" aria-label="Application filings and approvals over the last six months">
              {overview.trend.map((point) => <div className="mini-chart-column" key={point.month} title={`${point.month}: ${point.filed} filed, ${point.approved} approved`}>
                <div className="mini-chart-bars"><i className="mini-filed" style={{ height: `${Math.max(4, point.filed / maxTrend * 100)}%` }} /><i className="mini-approved" style={{ height: `${Math.max(4, point.approved / maxTrend * 100)}%` }} /></div><small>{point.month.slice(2)}</small>
              </div>)}
            </div>
            <div className="mini-chart-legend"><span><i className="mini-filed" />Filed</span><span><i className="mini-approved" />Approved</span></div>
          </section> : null}
        </aside>
      </div>
    </div>
  );
}
