import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getComplianceCase,
  listComplianceCases,
  resolveComplianceCase,
  submitRemediation,
  type ComplianceCase,
  type ComplianceCaseDetail,
  type ComplianceCounts,
} from "../api/compliance";

function statusChip(status: string) {
  const cls =
    status === "RESOLVED"
      ? "chip-status-active"
      : status === "REMEDIATED"
        ? "chip-sla-soon"
        : "chip-status-rejected";
  return <span className={`chip ${cls}`}>{status}</span>;
}

const SEVERITY_CLS: Record<string, string> = {
  NON_COMPLIANT: "chip-status-rejected",
  DEFICIENT: "chip-sla-soon",
};

export function CompliancePage() {
  const { user, signOut } = useAuth();
  const [items, setItems] = useState<ComplianceCase[] | null>(null);
  const [counts, setCounts] = useState<ComplianceCounts | null>(null);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ComplianceCaseDetail | null>(null);
  const [notes, setNotes] = useState("");

  function load(status: string) {
    setErr(null);
    listComplianceCases(status ? { status } : {})
      .then((res) => {
        setItems(res.items);
        setCounts(res.counts);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load compliance cases"));
  }

  useEffect(() => {
    load(filter);
  }, [filter]);

  function openDetail(caseId: string) {
    if (selected === caseId) {
      setSelected(null);
      setDetail(null);
      setNotes("");
      return;
    }
    setSelected(caseId);
    setDetail(null);
    setNotes("");
    setErr(null);
    getComplianceCase(caseId)
      .then((res) => setDetail(res.case))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load case"));
  }

  async function remediate() {
    if (!detail || !notes.trim()) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await submitRemediation(detail.id, notes.trim());
      setNotice("Remediation submitted — waiting for officer verification.");
      setNotes("");
      await getComplianceCase(detail.id).then((res) => setDetail(res.case));
      load(filter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remediation failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(accepted: boolean) {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await resolveComplianceCase(detail.id, accepted, notes.trim() || undefined);
      setNotice(accepted ? "Remediation accepted — case resolved." : "Remediation rejected — case reopened.");
      setNotes("");
      await getComplianceCase(detail.id).then((res) => setDetail(res.case));
      load(filter);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  const FILTERS = [
    { key: "", label: "All" },
    { key: "OPEN", label: "Open" },
    { key: "REMEDIATED", label: "Remediated" },
    { key: "RESOLVED", label: "Resolved" },
  ];
  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <Link to="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
          <Link to="/renewals" className="btn btn-ghost btn-sm">Renewals</Link>
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign out</Link>
        </nav>
      </header>

      <main>
        <section className="welcome">
          <div className="module-title-row">
            <h1>Compliance monitoring</h1>
            <span>
              {counts ? (
                <span>
                  <span className="chip chip-status-rejected">{counts.OPEN} open</span>{" "}
                  <span className="chip chip-sla-soon">{counts.REMEDIATED} awaiting verification</span>{" "}
                  <span className="chip chip-status-active">{counts.RESOLVED} resolved</span>
                </span>
              ) : null}
            </span>
          </div>
          <p>
            Inspection verdicts below COMPLIANT open a remediation case — file proof, get it verified,
            and clear the blocker on your renewals.
          </p>
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}
        {notice ? <div className="alert">{notice}</div> : null}

        <section className="wizard">
          <div className="module-title-row">
            <h3 className="stage-title">Cases</h3>
          </div>
          <p className="filter-row">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`btn btn-ghost btn-sm ${filter === f.key ? "btn-selected" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {counts && f.key ? ` (${(counts as unknown as Record<string, number>)[f.key] ?? 0})` : ""}
              </button>
            ))}
          </p>

          {items !== null && items.length > 0 ? (
            <table className="table rules-table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Unit</th>
                  <th>Application</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className={`chip ${SEVERITY_CLS[c.severity] ?? ""}`}>{c.severity}</span>
                      <br />
                      <span className="muted-text">{(c.findings ?? "").slice(0, 90)}</span>
                    </td>
                    <td>{c.unit.name}</td>
                    <td>
                      {c.application ? (
                        <Link to={`/applications/${c.application.id}`}>{c.application.applicationNo}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {c.remediationDueAt ? (
                        <span className={c.overdue ? "sla-overdue" : "sla-soon"}>
                          {c.remediationDueAt.slice(0, 10)}
                          {c.overdue ? " (overdue)" : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{statusChip(c.status)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openDetail(c.id)}>
                        {selected === c.id ? "Close" : "Details"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : items !== null ? (
            <p className="muted-text">No compliance cases match this filter.</p>
          ) : (
            <p className="muted-text">Loading…</p>
          )}
        </section>
        {selected && detail ? (
          <section className="form-card risk-panel" aria-live="polite">
            <div className="module-title-row">
              <h3>{detail.severity} · {detail.unit.name}</h3>
              {statusChip(detail.status)}
            </div>
            <p className="muted-text">
              Opened {detail.createdAt.slice(0, 10)}
              {detail.remediationDueAt ? ` · remediate by ${detail.remediationDueAt.slice(0, 10)}` : ""}
              {detail.overdue ? " · OVERDUE" : ""}
              {detail.inspection ? ` · inspection: ${detail.inspection.title}` : ""}
            </p>
            <p><strong>Findings:</strong> {detail.findings}</p>
            {detail.remediationNotes ? (
              <p><strong>Remediation:</strong> {detail.remediationNotes}</p>
            ) : null}
            {detail.resolutionNotes ? (
              <p><strong>Officer notes:</strong> {detail.resolutionNotes}</p>
            ) : null}

            {detail.canRemediate ? (
              <div className="track-actions">
                <label className="muted-text" htmlFor="remediation-notes">File remediation proof</label>
                <textarea
                  id="remediation-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the corrective action taken (attachments can follow in the application)…"
                />
                <div className="action-row">
                  <button className="btn btn-primary btn-sm" disabled={busy || !notes.trim()} onClick={remediate}>
                    {busy ? "Submitting…" : "Submit remediation"}
                  </button>
                </div>
              </div>
            ) : null}

            {detail.canResolve ? (
              <div className="track-actions">
                <label className="muted-text" htmlFor="resolve-notes">Verification notes (optional)</label>
                <textarea
                  id="resolve-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did you verify on site / in the documents?"
                />
                <div className="action-row">
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => resolve(true)}>
                    Accept &amp; resolve
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => resolve(false)}>
                    Reject &amp; reopen
                  </button>
                </div>
              </div>
            ) : null}

            {detail.events.length > 0 ? (
              <>
                <h4 style={{ marginTop: "1rem" }}>Case history</h4>
                <ul className="timeline">
                  {detail.events.map((e) => (
                    <li key={e.id}>
                      <div className="tl-meta">
                        <strong>{e.eventType.replaceAll("_", " ")}</strong> · {e.actorRole} ·{" "}
                        {e.createdAt.slice(0, 16).replace("T", " ")}
                      </div>
                      {e.comment ? <p className="tl-comment">{e.comment}</p> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : selected ? (
          <section className="form-card risk-panel">
            <p className="muted-text">Loading case…</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
