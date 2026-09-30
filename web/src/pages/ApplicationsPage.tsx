import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createApplication, listApplications, type ApplicationSummary } from "../api/applications";
import { listUnits, type Unit } from "../api/units";
import { listApprovalTypes } from "../api/rules";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_SCRUTINY: "Under scrutiny",
  QUERY: "Query raised",
  QUERY_RESPONDED: "Responded",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export function ApplicationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<ApplicationSummary[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [approvalTypes, setApprovalTypes] = useState<{ code: string; name: string }[]>([]);
  const [unitId, setUnitId] = useState("");
  const [approvalTypeCode, setApprovalTypeCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function load() {
    listApplications()
      .then((d) => setItems(d.items))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }

  useEffect(() => {
    load();
    listUnits().then((d) => {
      setUnits(d.items);
      if (d.items.length > 0) setUnitId(d.items[0].id);
    }).catch(() => {});
    listApprovalTypes()
      .then((d) => setApprovalTypes(d.items))
      .catch(() => {});
  }, []);

  async function startApplication() {
    setErr(null);
    try {
      const res = await createApplication({ unitId, approvalTypeCode });
      navigate(`/applications/${res.application.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create application");
    }
  }

  if (!user) return null;

  return (
    <div className="page">
        <section className="welcome">
          <h1>
            My <span className="accent">Applications</span>
          </h1>
          <p>Guided forms, document pre-validation and submission for each approval.</p>
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}

        <section className="wizard">
          <h2 className="stage-title">Start a new application</h2>
          {units.length === 0 ? (
            <p className="hint">
              Register a <Link to="/checklists/new">unit first</Link> (or open the wizard and link a unit) — applications require a unit.
            </p>
          ) : (
            <div className="form-grid">
              <label className="field"><span>Unit</span>
                <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Approval type</span>
                <select value={approvalTypeCode} onChange={(e) => setApprovalTypeCode(e.target.value)}>
                  <option value="">Select…</option>
                  {approvalTypes.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                </select>
              </label>
              <button className="btn btn-primary" onClick={startApplication} disabled={!unitId || !approvalTypeCode}>
                Create draft application
              </button>
            </div>
          )}
        </section>

        <section className="rules-grid">
          <h2 className="stage-title">Submitted &amp; draft applications</h2>
          <table className="table rules-table">
            <thead>
              <tr>
                <th>Application No</th>
                <th>Approval</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Docs</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7}>No applications yet.</td></tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id}>
                    <td><code>{a.applicationNo}</code></td>
                    <td>{a.approvalType.name}</td>
                    <td>{a.unit.name}</td>
                    <td><span className={`chip chip-status-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status] ?? a.status}</span></td>
                    <td>{a._count.documents}</td>
                    <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td><Link to={`/applications/${a.id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
  );
}