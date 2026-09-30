import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  approveStep,
  escalateInstance,
  getDeptApplication,
  raiseQuery,
  rejectApplication,
  type DeptApplication,
} from "../api/department";
import { createInspection, getRiskAssessment, type RiskAssessment } from "../api/inspections";

export function DepartmentApplicationPage() {
  const { user } = useAuth();
  const params = useParams();
  const navigate = useNavigate();
  const id = String(params.id);

  const [app, setApp] = useState<DeptApplication | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [planWhen, setPlanWhen] = useState("");
  const [planVenue, setPlanVenue] = useState("");
  const [planDepts, setPlanDepts] = useState<string[]>([]);
  const [planBusy, setPlanBusy] = useState(false);

  function load() {
    getDeptApplication(id)
      .then((d) => setApp(d.application))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load application"));
    getRiskAssessment(id)
      .then((d) => setRisk(d.assessment))
      .catch(() => setRisk(null));
  }

  useEffect(load, [id]);

  async function act(instanceId: string, requireNote: boolean, fn: (note: string) => Promise<unknown>) {
    const note = (notes[instanceId] ?? "").trim();
    if (requireNote && !note) {
      setErr("This action needs a note — fill in the box above the buttons first.");
      return;
    }
    setErr(null);
    setBusyId(instanceId);
    try {
      await fn(note);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function planInspection() {
    if (!planWhen) {
      setErr("Pick a date and time for the visit.");
      return;
    }
    setErr(null);
    setPlanBusy(true);
    try {
      const r = await createInspection({
        applicationId: id,
        scheduledAt: new Date(planWhen).toISOString(),
        venue: planVenue.trim() || undefined,
        departmentCodes: planDepts.length > 0 ? planDepts : undefined,
      });
      setPlanOpen(false);
      setPlanWhen("");
      setPlanVenue("");
      navigate(`/inspections/${r.inspection.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to plan inspection");
    } finally {
      setPlanBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="page">
      {err ? <div className="alert alert-error">{err}</div> : null}

      {app ? (
          <>
            <section className="welcome">
              <div className="module-title-row">
                <h1>{app.applicationNo}</h1>
                <span className={`chip chip-status-${app.status.toLowerCase()}`}>{app.status}</span>
              </div>
              <p>
                {app.approvalType.name} · {app.unit?.name ?? "—"}
                {app.unit ? ` · ${app.unit.district ?? ""}, ${app.unit.state ?? ""}` : ""}
              </p>
              {app.approvals.length > 0 ? (
                <p>
                  <span className="chip chip-status-approved">
                    Approval {app.approvals[0].approvalNo}
                    {app.approvals[0].issuedAt
                      ? ` · issued ${new Date(app.approvals[0].issuedAt).toLocaleDateString()}`
                      : ""}
                  </span>
                </p>
              ) : null}
            </section>

            <section className="wizard">
              <h3 className="stage-title">Department tracks</h3>
              {app.workflowInstances.length === 0 ? (
                <p className="hint">No workflow tracks — application not yet submitted.</p>
              ) : (
                app.workflowInstances.map((inst) => {
                  const due = inst.slaDueAt ? new Date(inst.slaDueAt).getTime() : null;
                  const overdue = due !== null && due < Date.now();
                  const dueSoon = due !== null && !overdue && due < Date.now() + 24 * 3600000;
                  return (
                    <div key={inst.id} className="approval-card">
                      <div className="module-title-row">
                        <h4>{inst.department.name} ({inst.department.code})</h4>
                        <span className={`chip chip-status-${inst.status.toLowerCase()}`}>{inst.status}</span>
                      </div>
                      <p>
                        Step: <strong>{inst.currentStepLabel ?? "—"}</strong>
                        {inst.slaDueAt ? (
                          <>
                            {" · SLA by "}
                            <span className={overdue ? "sla-overdue" : dueSoon ? "sla-soon" : "hint"}>
                              {new Date(inst.slaDueAt).toLocaleString()}
                            </span>
                          </>
                        ) : null}
                        {overdue ? <> <span className="chip chip-sla-overdue">OVERDUE</span></> : null}
                        {inst.escalatedAt ? (
                          <> <span className="chip chip-sla-overdue">Escalated</span></>
                        ) : null}
                      </p>
                      {inst.status === "ACTIVE" ? (
                        <div className="track-actions">
                          <textarea
                            placeholder="Note for this action — required for query / escalate / reject"
                            value={notes[inst.id] ?? ""}
                            onChange={(e) =>
                              setNotes((prev) => ({ ...prev, [inst.id]: e.target.value }))
                            }
                          />
                          <div className="action-row">
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={busyId === inst.id}
                              onClick={() =>
                                act(inst.id, false, (note) =>
                                  approveStep(id, inst.id, note || undefined)
                                )
                              }
                            >
                              Approve step
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busyId === inst.id}
                              onClick={() =>
                                act(inst.id, true, (note) => raiseQuery(id, inst.id, note))
                              }
                            >
                              Raise query
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busyId === inst.id}
                              onClick={() =>
                                act(inst.id, true, (note) => escalateInstance(id, inst.id, note))
                              }
                            >
                              Escalate
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busyId === inst.id}
                              onClick={() => {
                                if (window.confirm("Reject the whole application?")) {
                                  act(inst.id, true, (note) => rejectApplication(id, inst.id, note));
                                }
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ) : inst.status === "QUERY_WAITING" ? (
                        <p className="hint">Waiting for the applicant to respond to the query.</p>
                      ) : (
                        <p className="hint">Track {inst.status.toLowerCase()} — no action possible.</p>
                      )}
                    </div>
                  );
                })
              )}
            </section>
            <section className="wizard">
              <h3 className="stage-title">Risk-based scrutiny</h3>
              {risk ? (
                <div className="risk-panel">
                  <p>
                    <span className={`chip chip-risk-${risk.category.toLowerCase()}`}>{risk.category}</span>{" "}
                    <strong>score {risk.score}/100</strong> · {risk.scrutinyLevel} scrutiny
                    {risk.requiresInspection ? (
                      <>
                        {" "}
                        <span className="chip chip-risk-high">physical inspection expected</span>
                      </>
                    ) : null}
                    <span className="hint"> · assessed {new Date(risk.assessedAt).toLocaleString()}</span>
                  </p>
                  <ul className="factor-list">
                    {risk.factors.map((f) => (
                      <li key={f.code} className={f.points > 0 ? "factor-hit" : ""}>
                        <span>
                          <strong>{f.label}</strong> — {f.detail}
                        </span>
                        <span className="factor-points">+{f.points}</span>
                      </li>
                    ))}
                  </ul>
                  <p>
                    <button className="btn btn-ghost btn-sm" onClick={() => getRiskAssessment(id).then((d) => setRisk(d.assessment)).catch((e) => setErr(e instanceof Error ? e.message : "Re-score failed"))}>
                      Re-score
                    </button>
                  </p>
                </div>
              ) : (
                <p className="hint">No assessment yet.</p>
              )}
            </section>

            <section className="wizard">
              <h3 className="stage-title">Site inspections ({app.inspections.length})</h3>
              {app.inspections.length > 0 ? (
                app.inspections.map((ins) => (
                  <div className="doc-row" key={ins.id}>
                    <span>
                      <strong>{ins.title}</strong>
                      <br />
                      <span className="hint">
                        {new Date(ins.scheduledAt).toLocaleString()} · {ins.participants.map((p) => p.department.code).join(", ")}
                        {ins.complianceStatus ? ` · ${ins.complianceStatus}` : ""}
                      </span>
                    </span>
                    <span>
                      <span className={`chip ${ins.status === "COMPLETED" ? "chip-status-approved" : ins.status === "CANCELLED" ? "chip-status-rejected" : "chip-status-under_scrutiny"}`}>
                        {ins.status.replace("_", " ")}
                      </span>{" "}
                      <Link to={`/inspections/${ins.id}`} className="btn btn-ghost btn-sm">Open</Link>
                    </span>
                  </div>
                ))
              ) : (
                <p className="hint">No site visits planned.</p>
              )}

              {(() => {
                const open = app.inspections.some((i) => i.status === "SCHEDULED" || i.status === "IN_PROGRESS");
                const trackDepts = [...new Set(app.workflowInstances.map((t) => t.department.code))];
                if (open) return <p className="hint">A visit is already on the calendar.</p>;
                if (app.status === "DRAFT" || app.status === "WITHDRAWN")
                  return <p className="hint">Submit the application before planning an inspection.</p>;
                if (!planOpen)
                  return (
                    <p>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setPlanDepts(trackDepts); setPlanOpen(true); }}>
                        Plan joint inspection
                      </button>
                    </p>
                  );
                return (
                  <div className="form-card">
                    <h4>Plan one visit, all departments</h4>
                    <label>
                      Date &amp; time
                      <input type="datetime-local" value={planWhen} onChange={(e) => setPlanWhen(e.target.value)} />
                    </label>
                    <label>
                      Venue (site address)
                      <input
                        type="text"
                        value={planVenue}
                        onChange={(e) => setPlanVenue(e.target.value)}
                        placeholder={app.unit ? `${app.unit.name}, ${app.unit.district ?? ""}` : "Unit address"}
                      />
                    </label>
                    <p className="hint">Departments (defaults to this application's workflow tracks):</p>
                    <p className="filter-row">
                      {trackDepts.map((code) => (
                        <label key={code} className="inline-check">
                          <input
                            type="checkbox"
                            checked={planDepts.includes(code)}
                            onChange={(e) =>
                              setPlanDepts((prev) => (e.target.checked ? [...prev, code] : prev.filter((c) => c !== code)))
                            }
                          />{" "}
                          {code}
                        </label>
                      ))}
                    </p>
                    <button className="btn btn-ghost btn-sm" disabled={planBusy} onClick={planInspection}>
                      {planBusy ? "Scheduling…" : "Schedule inspection"}
                    </button>{" "}
                    <button className="btn btn-ghost btn-sm" onClick={() => setPlanOpen(false)}>
                      Cancel
                    </button>
                  </div>
                );
              })()}
            </section>

            <section className="wizard">
              <h3 className="stage-title">Documents ({app.documents.length})</h3>
              {app.documents.length === 0 ? (
                <p className="hint">No documents attached.</p>
              ) : (
                app.documents.map((d) => (
                  <div key={d.id} className="doc-row">
                    <span>
                      {d.documentType.name} — {d.originalName} ({Math.round(d.sizeBytes / 1024)} KB)
                    </span>
                    <span className={`chip chip-status-${d.status.toLowerCase()}`}>{d.status}</span>
                  </div>
                ))
              )}
            </section>

            <section className="wizard">
              <h3 className="stage-title">Audit trail ({app.events.length} events)</h3>
              {app.events.length === 0 ? (
                <p className="hint">No events yet.</p>
              ) : (
                <ul className="timeline">
                  {app.events.map((ev) => (
                    <li key={ev.id}>
                      <div className="tl-meta">
                        <strong>{ev.eventType}</strong> · {ev.actorRole} ·{" "}
                        {new Date(ev.createdAt).toLocaleString()}
                        {ev.toStatus ? <> → {ev.toStatus}</> : null}
                      </div>
                      {ev.comment ? <p className="tl-comment">{ev.comment}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <div className="app-loading">Loading application…</div>
        )}
      </div>
  );
}