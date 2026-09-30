import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  assignInspector,
  cancelInspection,
  completeInspection,
  fileObservation,
  getInspection,
  listInspectors,
  startInspection,
  type InspectionDetail,
  type InspectorDirectoryItem,
} from "../api/inspections";

export function InspectionDetailPage() {
  const { user, signOut } = useAuth();
  const params = useParams();
  const id = String(params.id);

  const [insp, setInsp] = useState<InspectionDetail | null>(null);
  const [inspectors, setInspectors] = useState<InspectorDirectoryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // observation form
  const [obsNotes, setObsNotes] = useState("");
  const [obsCompliant, setObsCompliant] = useState(true);
  const [obsParticipant, setObsParticipant] = useState("");
  // complete form
  const [findings, setFindings] = useState("");
  const [compliance, setCompliance] = useState("COMPLIANT");
  // cancel form
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  function load() {
    getInspection(id)
      .then((d) => setInsp(d.inspection))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load inspection"));
    listInspectors()
      .then((d) => setInspectors(d.items))
      .catch(() => setInspectors([]));
  }

  useEffect(load, [id]);

  async function act(label: string, fn: () => Promise<unknown>, okMsg?: string) {
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      setNotice(okMsg ?? `${label} — done.`);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  if (!user || !insp) {
    return <div className="app-loading">{insp === null && err === null ? "Loading inspection…" : err ?? "Loading…"}</div>;
  }

  const isOfficer = insp.canManage;
  const myIds = insp.myParticipantIds;
  const isOpen = insp.status === "SCHEDULED" || insp.status === "IN_PROGRESS";
  const canStart = insp.status === "SCHEDULED" && (isOfficer || myIds.length > 0);
  const canObserve = insp.status === "IN_PROGRESS" && myIds.length > 0;
  const risk = insp.risk;

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <Link to="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
          <Link to="/inspections" className="btn btn-ghost btn-sm">Inspections</Link>
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign out</Link>
        </nav>
      </header>

      <main>
        <section className="welcome">
          <div className="module-title-row">
            <h1>{insp.title}</h1>
            <span className={`chip ${insp.status === "COMPLETED" ? "chip-status-approved" : insp.status === "CANCELLED" ? "chip-status-rejected" : "chip-status-under_scrutiny"}`}>
              {insp.status.replace("_", " ")}
            </span>
          </div>
          <p>
            {insp.application.applicationNo} · {insp.application.approvalType.name} ·{" "}
            {insp.application.unit.name} ({insp.application.unit.district ?? "—"}, {insp.application.unit.state ?? "—"})
          </p>
          <p className="hint">
            {new Date(insp.scheduledAt).toLocaleString()} · {insp.venue ?? "venue TBC"}
            {insp.complianceStatus ? (
              <>
                {" · "}
                <span className={`chip ${insp.complianceStatus === "COMPLIANT" ? "chip-status-approved" : "chip-risk-high"}`}>
                  {insp.complianceStatus}
                </span>
              </>
            ) : null}
          </p>
          <p>
            <Link to={`/department/applications/${insp.application.id}`} className="btn btn-ghost btn-sm">
              Open application
            </Link>
          </p>
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}
        {notice ? <div className="alert">{notice}</div> : null}

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
                {insp.riskScoreAtScheduling !== null ? (
                  <span className="hint"> · snapshotted at planning: {insp.riskScoreAtScheduling}</span>
                ) : null}
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
            </div>
          ) : (
            <p className="hint">No assessment yet — score it from the application page.</p>
          )}
        </section>

        <section className="wizard">
          <h3 className="stage-title">Departments on this visit ({insp.participants.length})</h3>
          {insp.participants.map((p) => (
            <div className="doc-row" key={p.id}>
              <span>
                <strong>{p.department.name}</strong> ({p.department.code})
                {p.inspector ? (
                  <>
                    {" — inspector "}
                    <strong>{p.inspector.fullName}</strong>
                  </>
                ) : (
                  <span className="chip chip-sla-soon">unassigned</span>
                )}
                {p.observedAt ? <span className="chip chip-status-approved"> observed</span> : null}
              </span>
              {isOfficer && insp.status !== "CANCELLED" && insp.status !== "COMPLETED" ? (
                <span>
                  <select
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      act("Assign inspector", () => assignInspector(id, p.id, val), "Inspector assigned.");
                    }}
                  >
                    <option value="">
                      {p.inspector ? "Reassign…" : "Assign inspector…"}
                    </option>
                    {inspectors
                      .filter((i) => i.id !== p.inspector?.id)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.fullName} ({i.department?.code ?? "no dept"})
                        </option>
                      ))}
                  </select>
                </span>
              ) : null}
            </div>
          ))}

          {canStart ? (
            <p>
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => act("Start", () => startInspection(id), "Visit started.")}
              >
                Start site visit
              </button>
            </p>
          ) : null}

          {canObserve ? (
            <div className="form-card">
              <h4>File department observation</h4>
              {myIds.length > 1 ? (
                <label>
                  Department
                  <select value={obsParticipant} onChange={(e) => setObsParticipant(e.target.value)}>
                    <option value="">pick…</option>
                    {insp.participants
                      .filter((p) => myIds.includes(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.department.code}</option>
                      ))}
                  </select>
                </label>
              ) : null}
              <label>
                <input
                  type="checkbox"
                  checked={obsCompliant}
                  onChange={(e) => setObsCompliant(e.target.checked)}
                />{" "}
                Department compliant on site
              </label>
              <label>
                Observations
                <textarea
                  rows={3}
                  value={obsNotes}
                  onChange={(e) => setObsNotes(e.target.value)}
                  placeholder="What did you find at the site?"
                />
              </label>
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy || !obsNotes.trim()}
                onClick={() => {
                  if (!obsNotes.trim()) return;
                  act(
                    "File observation",
                    () =>
                      fileObservation(id, {
                        participantId: obsParticipant || (myIds.length === 1 ? myIds[0] : undefined),
                        compliant: obsCompliant,
                        notes: obsNotes.trim(),
                      }),
                    "Observation filed."
                  ).then(() => setObsNotes(""));
                }}
              >
                Submit observation
              </button>
            </div>
          ) : null}
        </section>

        {insp.findings ? (
          <section className="wizard">
            <h3 className="stage-title">Consolidated field report</h3>
            <p>{insp.findings}</p>
            <p className="hint">
              Completed {insp.completedAt ? new Date(insp.completedAt).toLocaleString() : "—"} · verdict{" "}
              <strong>{insp.complianceStatus ?? "—"}</strong>
            </p>
          </section>
        ) : null}

        <section className="wizard">
          <h3 className="stage-title">Department observations ({insp.observations.length})</h3>
          {insp.observations.length === 0 ? (
            <p className="hint">No observations filed yet.</p>
          ) : (
            insp.observations.map((o) => (
              <div className="doc-row" key={o.id}>
                <span>
                  <strong>{o.participant.department.code}</strong>
                  {o.participant.inspector ? ` · ${o.participant.inspector.fullName}` : ""} — {o.notes}
                  <br />
                  <span className="hint">{new Date(o.createdAt).toLocaleString()}</span>
                </span>
                <span className={`chip ${o.compliant ? "chip-status-approved" : "chip-risk-high"}`}>
                  {o.compliant ? "compliant" : "deficiency"}
                </span>
              </div>
            ))
          )}
        </section>

        <section className="wizard">
          <h3 className="stage-title">Close-out &amp; actions</h3>
          {isOfficer && insp.status === "IN_PROGRESS" ? (
            <div className="form-card">
              <h4>Complete the inspection</h4>
              <label>
                Consolidated findings
                <textarea
                  rows={3}
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  placeholder="What was verified, what must be corrected?"
                />
              </label>
              <label>
                Compliance verdict
                <select value={compliance} onChange={(e) => setCompliance(e.target.value)}>
                  <option value="COMPLIANT">COMPLIANT</option>
                  <option value="DEFICIENT">DEFICIENT (minor)</option>
                  <option value="NON_COMPLIANT">NON_COMPLIANT</option>
                </select>
              </label>
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy || !findings.trim()}
                onClick={() =>
                  act("Complete", () => completeInspection(id, { findings: findings.trim(), complianceStatus: compliance }), "Inspection completed.").then(
                    () => setFindings("")
                  )
                }
              >
                Complete inspection
              </button>
            </div>
          ) : null}

          {isOfficer && isOpen ? (
            showCancel ? (
              <div className="form-card">
                <h4>Cancel this visit</h4>
                <label>
                  Reason
                  <textarea
                    rows={2}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Why is the visit being cancelled?"
                  />
                </label>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    act("Cancel", () => cancelInspection(id, cancelReason.trim()), "Inspection cancelled.").then(
                      () => setShowCancel(false)
                    )
                  }
                >
                  Confirm cancellation
                </button>{" "}
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCancel(false)}>
                  Keep visit
                </button>
              </div>
            ) : (
              <p>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCancel(true)}>
                  Cancel inspection
                </button>
              </p>
            )
          ) : null}
          {!isOfficer && !canObserve && !canStart ? (
            <p className="hint">You have no pending actions on this inspection.</p>
          ) : null}
        </section>

        <section className="wizard">
          <h3 className="stage-title">Inspection trail ({insp.events.length} events)</h3>
          {insp.events.length === 0 ? (
            <p className="hint">No events yet.</p>
          ) : (
            <ul className="timeline">
              {insp.events.map((ev) => (
                <li key={ev.id}>
                  <div className="tl-meta">
                    <strong>{ev.eventType}</strong> · {ev.actorRole} · {new Date(ev.createdAt).toLocaleString()}
                    {ev.toStatus ? <> → {ev.toStatus}</> : null}
                  </div>
                  {ev.comment ? <p className="tl-comment">{ev.comment}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}


