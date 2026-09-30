import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  createRenewal,
  getRenewalReadiness,
  listDueRenewals,
  runRenewalSweep,
  type DueRenewal,
  type RenewalReadiness,
} from "../api/renewals";

function stateChip(state: string) {
  const cls =
    state === "EXPIRED" || state === "REVOKED"
      ? "chip-status-rejected"
      : state === "DUE_SOON"
        ? "chip-sla-soon"
        : state === "NO_EXPIRY"
          ? "chip-status-submitted"
          : "chip-status-active";
  return <span className={`chip ${cls}`}>{state.replace("_", " ")}</span>;
}

export function RenewalsPage() {
  const { user, signOut } = useAuth();
  const [items, setItems] = useState<DueRenewal[] | null>(null);
  const [alertDays, setAlertDays] = useState(60);
  const [days, setDays] = useState(60);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<RenewalReadiness | null>(null);

  const isOfficer =
    user?.roles.some((r) => ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;

  function load(d: number) {
    setErr(null);
    listDueRenewals(d)
      .then((res) => {
        setItems(res.items);
        setAlertDays(res.alertDays);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load renewals"));
  }

  useEffect(() => {
    load(days);
  }, [days]);

  function openDetail(approvalId: string) {
    if (selected === approvalId) {
      setSelected(null);
      setReadiness(null);
      return;
    }
    setSelected(approvalId);
    setReadiness(null);
    setErr(null);
    getRenewalReadiness(approvalId)
      .then((res) => setReadiness(res.readiness))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load readiness"));
  }

  async function startRenewal() {
    if (!readiness) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const created = await createRenewal(readiness.approval.id);
      setNotice(`Renewal draft ${created.application.applicationNo} created — attach documents and submit it.`);
      await getRenewalReadiness(readiness.approval.id).then((res) => setReadiness(res.readiness));
      load(days);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to start renewal");
    } finally {
      setBusy(false);
    }
  }

  async function sweep() {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const r = await runRenewalSweep();
      setNotice(`Sweep completed — ${r.expired} approval(s) lapsed, ${r.alerts} alert(s) sent.`);
      load(days);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sweep failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  const dueSoon = (items ?? []).filter((a) => a.state === "DUE_SOON").length;
  const expired = (items ?? []).filter((a) => a.state === "EXPIRED").length;
  const WINDOW = [30, 60, 180, 400];
  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <Link to="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
          <Link to="/compliance" className="btn btn-ghost btn-sm">Compliance</Link>
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign out</Link>
        </nav>
      </header>

      <main>
        <section className="welcome">
          <div className="module-title-row">
            <h1>Renewals</h1>
            <span>
              <span className="chip chip-sla-soon">{dueSoon} due soon</span>{" "}
              <span className="chip chip-status-rejected">{expired} expired</span>{" "}
              <span className="chip chip-status-under_scrutiny">{(items ?? []).length} in window</span>
            </span>
          </div>
          <p>
            Approval lifecycle at a glance — expiry countdowns ({alertDays}-day alert window), blockers,
            and one-click renewal applications.
          </p>
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}
        {notice ? <div className="alert">{notice}</div> : null}

        <section className="wizard">
          <div className="module-title-row">
            <h3 className="stage-title">Approvals in the window</h3>
            <span>
              {isOfficer ? (
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={sweep}>
                  Run expiry sweep
                </button>
              ) : null}
            </span>
          </div>
          <p className="filter-row">
            {WINDOW.map((d) => (
              <button
                key={d}
                className={`btn btn-ghost btn-sm ${days === d ? "btn-selected" : ""}`}
                onClick={() => setDays(d)}
              >
                {d >= 400 ? "All" : `Next ${d} days`}
              </button>
            ))}
          </p>

          {items !== null && items.length > 0 ? (
            <table className="table rules-table">
              <thead>
                <tr>
                  <th>Approval</th>
                  <th>Unit</th>
                  <th>Valid till</th>
                  <th>Countdown</th>
                  <th>State</th>
                  <th>Blocks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.approvalNo}</strong>
                      <br />
                      <span className="muted-text">{a.approvalType.name}</span>
                      {a.renewalCount > 0 ? <span className="chip chip-status-active"> renewed ×{a.renewalCount}</span> : null}
                    </td>
                    <td>{a.unit.name}</td>
                    <td>{a.validTill ? a.validTill.slice(0, 10) : "No expiry"}</td>
                    <td>
                      {a.daysLeft === null ? (
                        "—"
                      ) : (
                        <span className={a.daysLeft < 0 ? "sla-overdue" : a.daysLeft <= alertDays ? "sla-soon" : ""}>
                          {a.daysLeft < 0 ? `${Math.abs(a.daysLeft)}d overdue` : `${a.daysLeft}d left`}
                        </span>
                      )}
                    </td>
                    <td>{stateChip(a.state)}</td>
                    <td>
                      {a.hasPendingRenewal ? <span className="chip chip-sla-soon">renewal pending</span> : null}
                      {a.openComplianceCases > 0 ? (
                        <span className="chip chip-status-rejected">{a.openComplianceCases} open case(s)</span>
                      ) : null}
                      {!a.hasPendingRenewal && a.openComplianceCases === 0 ? <span className="muted-text">none</span> : null}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openDetail(a.id)}>
                        {selected === a.id ? "Close" : "Details"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : items !== null ? (
            <p className="muted-text">No approvals expiring within {days} days — enjoy the quiet.</p>
          ) : (
            <p className="muted-text">Loading…</p>
          )}
        </section>
        {selected && readiness ? (
          <section className="form-card risk-panel" aria-live="polite">
            <div className="module-title-row">
              <h3>{readiness.approval.approvalNo} · {readiness.approval.approvalType.name}</h3>
              {stateChip(readiness.state)}
            </div>
            <p className="muted-text">
              Unit: {readiness.approval.unit.name} · Original: {readiness.approval.originalApplicationNo} ·
              Issued {readiness.approval.issuedAt.slice(0, 10)}
              {readiness.approval.validTill ? ` · valid till ${readiness.approval.validTill.slice(0, 10)}` : ""}
              {readiness.daysLeft !== null ? ` · ${readiness.daysLeft} day(s) left` : ""}
            </p>
            {readiness.pendingRenewal ? (
              <p>
                Renewal in flight:{" "}
                <Link to={`/applications/${readiness.pendingRenewal.id}`}>
                  {readiness.pendingRenewal.applicationNo}
                </Link>{" "}
                <span className="chip chip-sla-soon">{readiness.pendingRenewal.status}</span>
              </p>
            ) : null}
            {readiness.blockers.length > 0 ? (
              <ul className="factor-list">
                {readiness.blockers.map((b) => (
                  <li key={b.code} className="factor-hit">
                    <span>{b.code.replaceAll("_", " ")}</span>
                    <span className="muted-text">{b.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-text">No blockers — this approval is ready to renew.</p>
            )}
            {!isOfficer && readiness.canRenew ? (
              <div className="action-row" style={{ marginTop: "0.75rem" }}>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={startRenewal}>
                  {busy ? "Starting…" : "Start renewal"}
                </button>
              </div>
            ) : null}
          </section>
        ) : selected ? (
          <section className="form-card risk-panel">
            <p className="muted-text">Loading readiness…</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
