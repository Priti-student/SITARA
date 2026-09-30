import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listUnits, type Unit } from "../api/units";
import {
  CATEGORIES,
  acknowledgeGrievance,
  escalateGrievance,
  fileGrievance,
  getGrievance,
  listGrievances,
  respondToGrievance,
  resolveGrievance,
  type Grievance,
  type GrievanceCounts,
  type GrievanceDetail,
} from "../api/grievances";

const STATUS_CLS: Record<string, string> = {
  OPEN: "chip-status-submitted",
  IN_PROGRESS: "chip-status-under_scrutiny",
  ESCALATED: "chip-sla-overdue",
  RESOLVED: "chip-status-approved",
  REJECTED: "chip-status-rejected",
};

const FILTERS = ["ALL", "OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "REJECTED"];

function statusChip(status: string, overdue?: boolean) {
  return (
    <span>
      <span className={`chip ${STATUS_CLS[status] ?? ""}`}>{status.replaceAll("_", " ").toLowerCase()}</span>
      {overdue ? <> <span className="chip chip-sla-overdue">SLA missed</span></> : null}
    </span>
  );
}

export function GrievancesPage() {
  const { user, signOut } = useAuth();
  const [items, setItems] = useState<Grievance[] | null>(null);
  const [counts, setCounts] = useState<GrievanceCounts>({});
  const [status, setStatus] = useState("ALL");
  const [detail, setDetail] = useState<GrievanceDetail | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filing form
  const [showForm, setShowForm] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [priority, setPriority] = useState("MEDIUM");
  const [unitId, setUnitId] = useState("");

  // Action forms
  const [notes, setNotes] = useState("");
  const [escalateReason, setEscalateReason] = useState("");

  function load(s: string) {
    setErr(null);
    listGrievances(s === "ALL" ? {} : { status: s })
      .then((r) => {
        setItems(r.items);
        setCounts(r.counts);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load grievances"));
  }

  useEffect(() => {
    load(status);
    listUnits().then((r) => setUnits(r.items)).catch(() => setUnits([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      setNotes("");
      setEscalateReason("");
      return;
    }
    setOpenId(id);
    setDetail(null);
    setNotes("");
    setEscalateReason("");
    setErr(null);
    getGrievance(id)
      .then(setDetail)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load the grievance"));
  }

  /** Runs an action, then refreshes list + open detail. */
  async function act(label: string, run: () => Promise<{ grievance: { id: string } }>) {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await run();
      setNotice(`${label} — ${detail.grievance.referenceNo}.`);
      load(status);
      setDetail(await getGrievance(detail.grievance.id));
      setNotes("");
      setEscalateReason("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function fileIt() {
    if (!subject.trim() || !description.trim()) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const created = await fileGrievance({
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        ...(unitId ? { unitId } : {}),
      });
      setNotice(`Grievance ${created.grievance.referenceNo} filed — respond SLA applies from today.`);
      setShowForm(false);
      setSubject("");
      setDescription("");
      setUnitId("");
      load(status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Filing failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <Link to="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
          <Link to="/analytics" className="btn btn-ghost btn-sm">Analytics</Link>
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign out</Link>
        </nav>
      </header>

      <main>
        <section className="welcome">
          <div className="module-title-row">
            <h1>Grievances</h1>
            <span>
              <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
                {showForm ? "Cancel" : "File a grievance"}
              </button>
            </span>
          </div>
          <p className="muted-text">
            SLA clocks run from filing — HIGH = 2 days, MEDIUM = 5 days, LOW = 10 days. Officers acknowledge, respond
            and resolve; filers can escalate once the SLA is missed.
          </p>
          {err ? <p className="sla-overdue">{err}</p> : null}
          {notice ? <p className="sla-ok">{notice}</p> : null}
        </section>

        {showForm ? (
          <section className="form-card">
            <h3>File a grievance</h3>
            <div className="form-grid form-grid-wide">
              <label className="form-field">
                <span className="form-label">Subject</span>
                <input
                  className="input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Licence renewal query unanswered for a week"
                  maxLength={160}
                />
              </label>
              <label className="form-field">
                <span className="form-label">Category</span>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span className="form-label">Priority (sets SLA)</span>
                <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="HIGH">HIGH — 2 days</option>
                  <option value="MEDIUM">MEDIUM — 5 days</option>
                  <option value="LOW">LOW — 10 days</option>
                </select>
              </label>
              <label className="form-field">
                <span className="form-label">Related unit (optional)</span>
                <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  <option value="">— none —</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
              <label className="form-field form-field-wide">
                <span className="form-label">Description</span>
                <textarea
                  className="input"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what went wrong, where and when…"
                  maxLength={4000}
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy || !subject.trim() || !description.trim()} onClick={fileIt}>
                {busy ? "Filing…" : "Submit grievance"}
              </button>
            </div>
          </section>
        ) : null}

        <div className="filter-chips" role="tabList" aria-label="Grievance status filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-chip${status === f ? " filter-chip-active" : ""}`}
              onClick={() => setStatus(f)}
            >
              {f.replaceAll("_", " ")}
              {f !== "ALL" && counts[f] != null ? ` (${counts[f]})` : ""}
            </button>
          ))}
        </div>

        <section className="form-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>SLA due</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {items === null ? (
                  <tr><td colSpan={7} className="muted-text">Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} className="muted-text">No grievances in this view.</td></tr>
                ) : (
                  items.map((g) => {
                    const overdue =
                      g.overdue ??
                      ((g.status === "OPEN" || g.status === "IN_PROGRESS") && new Date(g.slaDueAt).getTime() < Date.now());
                    return (
                      <tr key={g.id} className={openId === g.id ? "row-selected" : undefined}>
                        <td><strong>{g.referenceNo}</strong></td>
                        <td>{g.subject}</td>
                        <td>{g.category.replaceAll("_", " ")}</td>
                        <td>
                          <span className={`chip ${g.priority === "HIGH" ? "chip-sla-overdue" : g.priority === "MEDIUM" ? "chip-sla-soon" : "chip-status-submitted"}`}>
                            {g.priority}
                          </span>
                        </td>
                        <td>{statusChip(g.status, overdue)}</td>
                        <td className={overdue ? "sla-overdue" : "sla-soon"}>{new Date(g.slaDueAt).toLocaleDateString()}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggle(g.id)}>
                            {openId === g.id ? "Close" : "View"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {openId ? (
          <section className="form-card">
            {!detail ? (
              <p className="muted-text">Loading details…</p>
            ) : (
              <>
                <div className="module-title-row">
                  <h3>{detail.grievance.referenceNo} — {detail.grievance.subject}</h3>
                  <span>
                    {statusChip(detail.grievance.status, detail.grievance.overdue)}
                    <span className="chip chip-accent">level {detail.grievance.escalationLevel}</span>
                  </span>
                </div>
                <p className="muted-text">{detail.grievance.description}</p>
                <dl className="detail-grid">
                  <div><dt>Filed by</dt><dd>{detail.grievance.creator?.fullName ?? "—"}</dd></div>
                  <div><dt>Unit</dt><dd>{detail.grievance.unit?.name ?? "—"}</dd></div>
                  <div><dt>Filed</dt><dd>{new Date(detail.grievance.createdAt).toLocaleString()}</dd></div>
                  <div><dt>SLA due</dt><dd className={detail.grievance.overdue ? "sla-overdue" : "sla-soon"}>{new Date(detail.grievance.slaDueAt).toLocaleString()}</dd></div>
                  <div><dt>Assigned</dt><dd>{detail.grievance.assignee?.fullName ?? "unassigned"}</dd></div>
                  {detail.grievance.responseNotes ? (
                    <div className="detail-wide"><dt>Officer response</dt><dd>{detail.grievance.responseNotes}</dd></div>
                  ) : null}
                </dl>

                {detail.can.acknowledge || detail.can.respond || detail.can.resolve || detail.can.escalate ? (
                  <div className="form-card form-card-inner">
                    <h4>Actions</h4>
                    <label className="form-field">
                      <span className="form-label">Notes / response</span>
                      <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What has been done or decided…" />
                    </label>
                    <div className="form-actions">
                      {detail.can.acknowledge ? (
                        <button className="btn btn-secondary" disabled={busy} onClick={() => act("Acknowledged", () => acknowledgeGrievance(detail.grievance.id))}>
                          Acknowledge
                        </button>
                      ) : null}
                      {detail.can.respond ? (
                        <button className="btn btn-primary" disabled={busy || !notes.trim()} onClick={() => act("Response recorded", () => respondToGrievance(detail.grievance.id, notes.trim()))}>
                          Add response
                        </button>
                      ) : null}
                      {detail.can.resolve ? (
                        <>
                          <button className="btn btn-success" disabled={busy || !notes.trim()} onClick={() => act("Grievance resolved", () => resolveGrievance(detail.grievance.id, true, notes.trim()))}>
                            Resolve
                          </button>
                          <button className="btn btn-danger" disabled={busy || !notes.trim()} onClick={() => act("Grievance rejected", () => resolveGrievance(detail.grievance.id, false, notes.trim()))}>
                            Reject
                          </button>
                        </>
                      ) : null}
                      {detail.can.escalate ? (
                        <>
                          <input className="input" value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} placeholder="Escalation reason (required)" />
                          <button className="btn btn-danger" disabled={busy || !escalateReason.trim()} onClick={() => act("Escalated", () => escalateGrievance(detail.grievance.id, escalateReason.trim()))}>
                            Escalate
                          </button>
                        </>
                      ) : null}
                    </div>
                    {!detail.can.acknowledge && !detail.can.resolve ? (
                      <p className="hint">Filers can escalate only once the SLA is missed.</p>
                    ) : null}
                  </div>
                ) : null}

                <h4>Audit timeline</h4>
                <ul className="timeline">
                  {detail.events.map((ev) => (
                    <li key={ev.id} className="timeline-item">
                      <span className={`chip ${ev.eventType.includes("RESOLVED") ? "chip-status-approved" : ev.eventType.includes("REJECTED") ? "chip-status-rejected" : ev.eventType === "ESCALATED" ? "chip-sla-overdue" : "chip-status-submitted"}`}>
                        {ev.eventType.replaceAll("_", " ")}
                      </span>
                      <div>
                        <p>{ev.comment ?? "—"}</p>
                        <span className="hint">{ev.actorRole} · {new Date(ev.createdAt).toLocaleString()}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}

