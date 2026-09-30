import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getDeptInbox, runSla, type DeptInbox } from "../api/department";

function slaCell(item: DeptInbox["items"][number]) {
  if (item.overdue) return <span className="chip chip-sla-overdue">OVERDUE</span>;
  if (item.escalated) return <span className="chip chip-sla-overdue">Escalated</span>;
  if (item.dueSoon) return <span className="chip chip-sla-soon">Due soon</span>;
  if (item.slaDueAt) return <span className="hint">{new Date(item.slaDueAt).toLocaleDateString()}</span>;
  return <span className="hint">—</span>;
}

export function DepartmentInboxPage() {
  const { user } = useAuth();
  const [inbox, setInbox] = useState<DeptInbox | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.roles.some((r) => r === "SUPER_ADMIN" || r === "STATE_ADMIN") ?? false;

  function load() {
    getDeptInbox()
      .then(setInbox)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load inbox"));
  }

  useEffect(load, []);

  async function slaRun() {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const r = await runSla();
      setNotice(`SLA pass complete — ${r.overdue} overdue item(s) escalated.`);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "SLA run failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="page">
        <section className="welcome">
          <div className="module-title-row">
            <h1>Department inbox{inbox?.myDepartment ? ` — ${inbox.myDepartment.name}` : ""}</h1>
            {inbox ? (
              <span>
                <span className="chip">{inbox.counts.active} active</span>{" "}
                <span className="chip chip-accent">{inbox.counts.queries} queries</span>{" "}
                <span className={`chip ${inbox.counts.overdue > 0 ? "chip-sla-overdue" : ""}`}>
                  {inbox.counts.overdue} overdue
                </span>
              </span>
            ) : null}
          </div>
          <p>Workflow items assigned to your department — act within the SLA window.</p>
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}
        {notice ? <div className="alert">{notice}</div> : null}

        {isAdmin ? (
          <p>
            <button className="btn btn-ghost btn-sm" onClick={slaRun} disabled={busy}>
              {busy ? "Running…" : "Run SLA pass now"}
            </button>
          </p>
        ) : null}

        <section className="wizard">
          <h3 className="stage-title">Active items</h3>
          {inbox !== null && inbox.items.length > 0 ? (
            <table className="table rules-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Unit</th>
                  <th>Approval</th>
                  <th>Track</th>
                  <th>Current step</th>
                  <th>SLA</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inbox.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.application.applicationNo}</strong>
                      <br />
                      <span className={`chip chip-status-${item.application.status.toLowerCase()}`}>
                        {item.application.status}
                      </span>
                      {item.status === "QUERY_WAITING" ? (
                        <>
                          {" "}
                          <span className="chip chip-status-query_waiting">awaiting reply</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {item.application.unit.name}
                      <br />
                      <span className="hint">{item.application.unit.district ?? "—"}</span>
                    </td>
                    <td>
                      {item.application.approvalType.name}
                      {item.application.riskCategory ? (
                        <>
                          <br />
                          <span className={`chip chip-risk-${item.application.riskCategory.toLowerCase()}`}>
                            {item.application.riskCategory}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>{item.department.code}</td>
                    <td>{item.currentStepLabel ?? "—"}</td>
                    <td>{slaCell(item)}</td>
                    <td>
                      <Link
                        to={`/department/applications/${item.application.id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <p className="hint">
                {inbox === null ? "Loading…" : "No active workflow items right now."}
              </p>
            </div>
          )}
        </section>
      </div>
  );
}