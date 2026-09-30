import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAlerts, getOverview, type AlertFeed, type Overview } from "../api/analytics";

const SEVERITY_CLS: Record<string, string> = {
  CRITICAL: "chip-status-rejected",
  HIGH: "chip-sla-overdue",
  MEDIUM: "chip-sla-soon",
  LOW: "chip-status-submitted",
};

const APP_FILTERS = ["SUBMITTED", "UNDER_SCRUTINY", "QUERY", "APPROVED", "REJECTED"];

function Breakdown({ title, data, keys }: { title: string; data: Record<string, number>; keys: string[] }) {
  return (
    <section className="form-card">
      <h3>{title}</h3>
      <ul className="breakdown-list">
        {keys.map((k) => (
          <li key={k}>
            <span className="muted-text">{k.replaceAll("_", " ")}</span>
            <strong>{data[k] ?? 0}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AnalyticsPage() {
  const { user, signOut } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [feed, setFeed] = useState<AlertFeed | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getOverview().then(setOverview).catch((e) => setErr(e instanceof Error ? e.message : "Failed to load dashboard"));
    getAlerts().then(setFeed).catch(() => setFeed(null));
  }, []);

  if (!user) return null;

  const maxTrend = overview ? Math.max(1, ...overview.trend.map((t) => t.filed)) : 1;
  const kpis = overview?.kpis;

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <Link to="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
          <Link to="/grievances" className="btn btn-ghost btn-sm">Grievances</Link>
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign out</Link>
        </nav>
      </header>

      <main>
        <section className="welcome">
          <div className="module-title-row">
            <h1>Analytics &amp; Alerts</h1>
            {overview ? (
              <span>
                <span className={`chip ${overview.scope === "PLATFORM" ? "chip-accent" : "chip-status-submitted"}`}>
                  {overview.scope === "PLATFORM" ? "Platform-wide" : "My units"}
                </span>
                <span className="chip chip-sla-soon">approval rate {overview.approvalRate ?? "—"}%</span>
              </span>
            ) : null}
          </div>
          {err ? <p className="sla-overdue">{err}</p> : null}
        </section>

        {kpis ? (
          <section className="kpi-grid">
            <div className="feature-card kpi-card"><strong>{kpis.units}</strong><span>Units</span></div>
            <div className="feature-card kpi-card"><strong>{kpis.applications}</strong><span>Applications</span></div>
            <div className="feature-card kpi-card"><strong>{kpis.activeTracks}</strong><span>Active tracks</span></div>
            <div className={`feature-card kpi-card${kpis.overdueTracks > 0 ? " kpi-warn" : ""}`}>
              <strong>{kpis.overdueTracks}</strong><span>Overdue SLAs</span>
            </div>
            <div className="feature-card kpi-card"><strong>{kpis.inspectionsCompleted}</strong><span>Inspections done</span></div>
            <div className={`feature-card kpi-card${kpis.renewalsDue > 0 ? " kpi-warn" : ""}`}>
              <strong>{kpis.renewalsDue}</strong><span>Renewals due</span>
            </div>
            <div className="feature-card kpi-card"><strong>{kpis.openComplianceCases}</strong><span>Open compliance</span></div>
            <div className="feature-card kpi-card"><strong>{kpis.openGrievances}</strong><span>Open grievances</span></div>
          </section>
        ) : (
          <p className="muted-text">Loading dashboard…</p>
        )}

        <section className="feature-grid">
          <section className="form-card">
            <h3>Application trend (6 months)</h3>
            {overview ? (
              <div className="trend-chart">
                {overview.trend.map((t) => (
                  <div className="trend-col" key={t.month} title={`${t.month}: ${t.filed} filed / ${t.approved} approved`}>
                    <div className="trend-bars">
                      <div className="trend-bar filed" style={{ height: `${(t.filed / maxTrend) * 100}%` }} />
                      <div className="trend-bar approved" style={{ height: `${(t.approved / maxTrend) * 100}%` }} />
                    </div>
                    <span className="hint">{t.month.slice(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-text">Loading…</p>
            )}
            <p className="hint">
              <span className="legend filed" /> filed &nbsp;
              <span className="legend approved" /> approved
            </p>
          </section>

          <section className="form-card">
            <h3>Alerts</h3>
            {feed && feed.items.length > 0 ? (
              <ul className="alert-list">
                {feed.items.map((a) => (
                  <li key={a.key} className="alert-row">
                    <span className={`chip ${SEVERITY_CLS[a.severity]}`}>{a.severity}</span>
                    <div>
                      <strong>{a.title}</strong>
                      <p className="muted-text">{a.message}</p>
                    </div>
                    <Link to={a.href} className="btn btn-ghost btn-sm">Open</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-text">No active alerts — everything is within limits.</p>
            )}
          </section>
        </section>

        <section className="feature-grid">
          <Breakdown title="Applications" data={overview?.applications ?? {}} keys={APP_FILTERS} />
          <Breakdown title="Inspections" data={overview?.inspections ?? {}} keys={["SCHEDULED", "IN_PROGRESS", "COMPLETED"]} />
          <Breakdown title="Incentive claims" data={overview?.claims ?? {}} keys={["SUBMITTED", "UNDER_REVIEW", "APPROVED", "DISBURSED"]} />
          <Breakdown title="Grievances" data={overview?.grievances ?? {}} keys={["OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED"]} />
        </section>

        {overview && overview.departments.length > 0 ? (
          <section className="form-card">
            <h3>Department workload (active tracks)</h3>
            <ul className="breakdown-list">
              {overview.departments.map((d) => (
                <li key={d.code}>
                  <span className="muted-text">{d.name}</span>
                  <strong>{d.active}</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
